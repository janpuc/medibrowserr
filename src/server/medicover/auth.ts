import "server-only";
import crypto from "node:crypto";
import { CookieJar } from "./cookiejar";
import { extractPageError, pageText, parseForms, type ParsedForm } from "./html";
import {
  getMedicoverSession,
  getSettings,
  saveMedicoverSession,
} from "@/server/settings";

export const LOGIN_URL = "https://login-online24.medicover.pl";
export const MAIN_URL = "https://online24.medicover.pl";
export const API_URL = "https://api-gateway-online24.medicover.pl";

// A stable, ordinary desktop UA. Keeping it constant across requests and
// restarts makes the "trusted device" persistence behave like a real browser.
export const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** The UA can be overridden (Settings / MEDIBROWSERR_USER_AGENT); cached briefly. */
let uaCache: { value: string; at: number } | null = null;
export async function currentUserAgent(): Promise<string> {
  if (uaCache && Date.now() - uaCache.at < 60_000) return uaCache.value;
  let value = USER_AGENT;
  try {
    const { userAgent } = await getSettings();
    if (userAgent?.trim()) value = userAgent.trim();
  } catch {
    /* settings unavailable during early boot — default UA is fine */
  }
  uaCache = { value, at: Date.now() };
  return value;
}

const APP_VERSION = "3.27.0-beta.1.4";

export class MedicoverAuthError extends Error {
  constructor(
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "MedicoverAuthError";
  }
}

/** Login got interrupted by an MFA step the user must complete in the UI. */
export class MfaInteractionRequired extends Error {
  constructor(public state: PendingLogin) {
    super("Medicover requires an MFA interaction");
    this.name = "MfaInteractionRequired";
  }
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Unix seconds. */
  expiresAt: number;
}

export type PendingKind =
  /** MfaGate: account has no MFA method yet; must enroll email or SMS. */
  | "mfa_setup"
  /** A code was sent (challenge or enrollment); waiting for the 6 digits. */
  | "mfa_code";

/**
 * State carried across the interactive MFA steps of one login attempt.
 * Lives in-memory only (single-user app); a restart just means re-login.
 */
export interface PendingLogin {
  kind: PendingKind;
  jar: CookieJar;
  codeVerifier: string;
  authParams: URLSearchParams;
  /** URL + parsed form of the page we must POST next. */
  formUrl: string;
  form: ParsedForm;
  /** For mfa_setup: masked contact hints scraped off the page, if any. */
  channelHint?: string;
  createdAt: number;
}

const b64url = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function newPkce() {
  const codeVerifier =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  const codeChallenge = b64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

function buildAuthParams(deviceId: string, codeChallenge: string): URLSearchParams {
  return new URLSearchParams({
    client_id: "web",
    redirect_uri: `${MAIN_URL}/signin-oidc`,
    response_type: "code",
    scope: "openid offline_access profile",
    state: crypto.randomUUID().replaceAll("-", ""),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    response_mode: "query",
    ui_locales: "pl",
    app_version: APP_VERSION,
    previous_app_version: APP_VERSION,
    device_id: deviceId,
    device_name: "Chrome",
    ts: String(Date.now()),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(
  jar: CookieJar,
  url: string,
  init: RequestInit & { referer?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": await currentUserAgent(),
    "Accept-Language": "pl,en;q=0.8",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.referer) headers["Referer"] = init.referer;
  const cookie = jar.header(url);
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  jar.absorb(url, res);
  return res;
}

function absolutize(location: string): string {
  return location.startsWith("http")
    ? location
    : LOGIN_URL + (location.startsWith("/") ? location : `/${location}`);
}

interface LoginOutcome {
  tokens?: TokenSet;
  pending?: PendingLogin;
}

/**
 * Runs /connect/authorize and follows redirects until it either finds the
 * signin-oidc auth code, a login form, or an MFA page.
 */
async function authorize(
  jar: CookieJar,
  authParams: URLSearchParams,
): Promise<{ code?: string; loginUrl?: string; mfaUrl?: string }> {
  authParams.set("ts", String(Date.now()));
  let res = await request(jar, `${LOGIN_URL}/connect/authorize?${authParams}`);
  for (let hop = 0; hop < 8; hop++) {
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) {
      throw new MedicoverAuthError(
        `Unexpected response (${res.status}) during authorization`,
        pageText(await res.text()),
      );
    }
    const url = absolutize(location);
    const parsed = new URL(url);
    if (parsed.pathname === "/signin-oidc") {
      const code = parsed.searchParams.get("code");
      if (!code) {
        throw new MedicoverAuthError(
          "signin-oidc redirect carried no authorization code",
          url,
        );
      }
      return { code };
    }
    if (/\/Account\/Login/i.test(parsed.pathname)) return { loginUrl: url };
    if (/\/Account\/Mfa/i.test(parsed.pathname)) return { mfaUrl: url };
    res = await request(jar, url);
  }
  throw new MedicoverAuthError("Too many redirects during authorization");
}

async function exchangeCode(
  jar: CookieJar,
  code: string,
  codeVerifier: string,
): Promise<TokenSet> {
  const res = await request(jar, `${LOGIN_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: MAIN_URL },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: `${MAIN_URL}/signin-oidc`,
      code,
      code_verifier: codeVerifier,
      client_id: "web",
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new MedicoverAuthError(
      "Token exchange failed",
      typeof data.error_description === "string"
        ? data.error_description
        : JSON.stringify(data).slice(0, 300),
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt:
      Math.floor(Date.now() / 1000) +
      (typeof data.expires_in === "number" ? data.expires_in : 300),
  };
}

/** Follows an MFA page redirect and classifies what the server wants next. */
async function inspectMfaPage(
  jar: CookieJar,
  mfaUrl: string,
  codeVerifier: string,
  authParams: URLSearchParams,
): Promise<LoginOutcome> {
  const res = await request(jar, mfaUrl);
  // A trusted device can be waved straight through.
  if (res.status >= 300 && res.status < 400) {
    const chase = await chaseCode(jar, absolutize(res.headers.get("location")!));
    if (chase) return { tokens: await exchangeCode(jar, chase, codeVerifier) };
    throw new MedicoverAuthError("MFA redirect did not produce a code");
  }
  const html = await res.text();
  const forms = parseForms(html);
  if (!forms.length) {
    throw new MedicoverAuthError("MFA page carried no form", pageText(html));
  }

  if (/MfaGate/i.test(mfaUrl)) {
    // Enrollment gate → the "add authenticator" page has the channel form.
    const gateForm = forms[0];
    const addAction = gateForm.buttonActions.find((a) => /AddAuthenticator/i.test(a));
    if (!addAction) {
      throw new MedicoverAuthError(
        "MfaGate page had no AddAuthenticator action",
        pageText(html),
      );
    }
    const gateRes = await request(jar, absolutize(addAction), {
      method: "POST",
      referer: mfaUrl,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: LOGIN_URL },
      body: new URLSearchParams(gateForm.fields),
    });
    const setupUrl = absolutize(gateRes.headers.get("location") ?? addAction);
    const setupRes = await request(jar, setupUrl, { referer: mfaUrl });
    const setupHtml = await setupRes.text();
    const setupForms = parseForms(setupHtml);
    if (!setupForms.length) {
      throw new MedicoverAuthError("MFA setup page had no form", pageText(setupHtml));
    }
    return {
      pending: {
        kind: "mfa_setup",
        jar,
        codeVerifier,
        authParams,
        formUrl: setupUrl,
        form: setupForms[0],
        createdAt: Date.now(),
      },
    };
  }

  // Regular challenge: a code was (or is being) sent to the enrolled channel.
  const challengeForm =
    forms.find((f) => Object.keys(f.fields).some((k) => /MfaCode/i.test(k))) ?? forms[0];
  const hint = html.match(/\+48[\s\d*]+|\S*\*{2,}\S*@\S+/)?.[0]?.trim();
  return {
    pending: {
      kind: "mfa_code",
      jar,
      codeVerifier,
      authParams,
      formUrl: mfaUrl,
      form: challengeForm,
      channelHint: hint,
      createdAt: Date.now(),
    },
  };
}

/** Follows redirects from `url` looking for signin-oidc?code=... */
async function chaseCode(jar: CookieJar, url: string): Promise<string | undefined> {
  let current = url;
  for (let hop = 0; hop < 8; hop++) {
    const parsed = new URL(current);
    if (parsed.pathname === "/signin-oidc") {
      return parsed.searchParams.get("code") ?? undefined;
    }
    const res = await request(jar, current);
    if (res.status < 300 || res.status >= 400) return undefined;
    const location = res.headers.get("location");
    if (!location) return undefined;
    current = absolutize(location);
  }
  return undefined;
}

/**
 * Starts a password login. Resolves with tokens when the device is trusted,
 * or throws MfaInteractionRequired carrying the state for the UI wizard.
 */
export async function passwordLogin(
  username: string,
  password: string,
  deviceId: string,
): Promise<TokenSet> {
  const jar = new CookieJar();
  const { codeVerifier, codeChallenge } = newPkce();
  const authParams = buildAuthParams(deviceId, codeChallenge);

  const step = await authorize(jar, authParams);
  if (step.code) return exchangeCode(jar, step.code, codeVerifier);
  if (step.mfaUrl) {
    const outcome = await inspectMfaPage(jar, step.mfaUrl, codeVerifier, authParams);
    if (outcome.tokens) return outcome.tokens;
    throw new MfaInteractionRequired(outcome.pending!);
  }

  const loginUrl = step.loginUrl!;
  const loginRes = await request(jar, loginUrl);
  const loginHtml = await loginRes.text();
  const loginForm = parseForms(loginHtml)[0];
  if (!loginForm?.fields["__RequestVerificationToken"]) {
    throw new MedicoverAuthError("Could not parse the login form", pageText(loginHtml));
  }
  const returnUrl = new URL(loginUrl).searchParams.get("ReturnUrl") ?? "";

  await sleep(400);
  const postRes = await request(jar, loginUrl, {
    method: "POST",
    referer: loginUrl,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: LOGIN_URL },
    body: new URLSearchParams({
      "Input.ReturnUrl": returnUrl,
      "Input.LoginType": "FullLogin",
      "Input.Username": username,
      "Input.Password": password,
      "Input.Button": "login",
      __RequestVerificationToken: loginForm.fields["__RequestVerificationToken"],
    }),
  });

  if (postRes.status === 200) {
    const html = await postRes.text();
    throw new MedicoverAuthError(
      "Medicover rejected the login",
      extractPageError(html) ?? pageText(html),
    );
  }
  const location = postRes.headers.get("location");
  if (!location) throw new MedicoverAuthError("Login response had no redirect");
  const nextUrl = absolutize(location);

  if (/\/Account\/Mfa/i.test(new URL(nextUrl).pathname)) {
    const outcome = await inspectMfaPage(jar, nextUrl, codeVerifier, authParams);
    if (outcome.tokens) return outcome.tokens;
    throw new MfaInteractionRequired(outcome.pending!);
  }

  const code = await chaseCode(jar, nextUrl);
  if (code) return exchangeCode(jar, code, codeVerifier);
  throw new MedicoverAuthError("Login did not reach the authorization code step");
}

/** POSTs the enrollment channel choice (email or SMS). Returns code-entry state. */
export async function submitMfaChannel(
  pending: PendingLogin,
  input: { channel: "Email" | "SMS"; email?: string; phonePrefix?: string; phone?: string },
): Promise<PendingLogin> {
  const fields = { ...pending.form.fields };
  fields["Input.Channel"] = input.channel;
  if (input.channel === "Email") {
    if (input.email) fields["Input.Email"] = input.email;
  } else {
    fields["Input.MobilePhonePrefix"] = input.phonePrefix ?? "+48";
    fields["Input.MobilePhonePrefixId"] = fields["Input.MobilePhonePrefixId"] || "PL";
    if (input.phone) fields["Input.MobilePhone"] = input.phone;
  }
  const target = pending.form.action ? absolutize(pending.form.action) : pending.formUrl;
  const res = await request(pending.jar, target, {
    method: "POST",
    referer: pending.formUrl,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: LOGIN_URL },
    body: new URLSearchParams(fields),
  });

  let pageUrl = pending.formUrl;
  let html: string;
  if (res.status >= 300 && res.status < 400) {
    pageUrl = absolutize(res.headers.get("location")!);
    const page = await request(pending.jar, pageUrl, { referer: pending.formUrl });
    html = await page.text();
  } else {
    html = await res.text();
  }
  const forms = parseForms(html);
  const codeForm = forms.find((f) =>
    Object.keys(f.fields).some((k) => /MfaCode(?!Id)/i.test(k) || /MfaCodeId/i.test(k)),
  );
  if (!codeForm) {
    throw new MedicoverAuthError(
      "Expected a code-entry form after choosing the MFA channel",
      extractPageError(html) ?? pageText(html),
    );
  }
  return { ...pending, kind: "mfa_code", formUrl: pageUrl, form: codeForm };
}

/** POSTs the 6-digit code, marks the device trusted, finishes the login. */
export async function submitMfaCode(
  pending: PendingLogin,
  code: string,
): Promise<TokenSet> {
  const fields = { ...pending.form.fields };
  const codeField =
    Object.keys(fields).find((k) => /MfaCode$/i.test(k)) ?? "Input.MfaCode";
  fields[codeField] = code;
  fields["Input.IsTrustedDevice"] = "true";
  if (!fields["Input.DeviceName"]) fields["Input.DeviceName"] = "Chrome";
  if (!fields["Input.Button"]) fields["Input.Button"] = "confirm";

  const action = pending.form.action
    ? absolutize(pending.form.action)
    : pending.formUrl;
  const res = await request(pending.jar, action, {
    method: "POST",
    referer: pending.formUrl,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: LOGIN_URL },
    body: new URLSearchParams(fields),
  });

  if (res.status === 200) {
    const html = await res.text();
    throw new MedicoverAuthError(
      "Medicover rejected the MFA code",
      extractPageError(html) ?? pageText(html),
    );
  }
  const location = res.headers.get("location");
  if (!location) throw new MedicoverAuthError("MFA confirmation had no redirect");

  // Preferred path: the redirect chain ends in signin-oidc?code=...
  const chased = await chaseCode(pending.jar, absolutize(location));
  if (chased) return exchangeCode(pending.jar, chased, pending.codeVerifier);

  // Fallback: the original authorize interaction was consumed (as happens
  // after enrollment). The session cookie is set now, so a fresh authorize
  // round trips straight back with a code.
  const { codeVerifier, codeChallenge } = newPkce();
  const deviceId = pending.authParams.get("device_id")!;
  const retryParams = buildAuthParams(deviceId, codeChallenge);
  const retry = await authorize(pending.jar, retryParams);
  if (retry.code) return exchangeCode(pending.jar, retry.code, codeVerifier);
  throw new MedicoverAuthError(
    "MFA completed but no authorization code followed; try connecting again",
  );
}

export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const jar = new CookieJar();
  const res = await request(jar, `${LOGIN_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: MAIN_URL },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "openid offline_access profile",
      client_id: "web",
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== "string") {
    throw new MedicoverAuthError(
      data.error === "invalid_grant" ? "invalid_grant" : "Token refresh failed",
      typeof data.error_description === "string" ? data.error_description : undefined,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : refreshToken,
    expiresAt:
      Math.floor(Date.now() / 1000) +
      (typeof data.expires_in === "number" ? data.expires_in : 300),
  };
}

// ---------------------------------------------------------------------------
// High-level session management

/** In-memory pending MFA state; single-user app, one login at a time. */
let pendingLogin: PendingLogin | null = null;
const PENDING_TTL_MS = 10 * 60 * 1000;

export function getPendingLogin(): PendingLogin | null {
  if (pendingLogin && Date.now() - pendingLogin.createdAt > PENDING_TTL_MS) {
    pendingLogin = null;
  }
  return pendingLogin;
}

export function setPendingLogin(state: PendingLogin | null): void {
  pendingLogin = state;
}

async function persistTokens(tokens: TokenSet): Promise<void> {
  await saveMedicoverSession({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
    status: "connected",
    statusDetail: undefined,
  });
}

/** Serializes concurrent token requests so we never double-refresh. */
let tokenGate: Promise<string> | null = null;

/**
 * Returns a valid access token: cached → refreshed → password login.
 * Throws MfaInteractionRequired (after stashing the pending state) when the
 * user has to type a code, and MedicoverAuthError for real failures.
 */
export async function ensureAccessToken(): Promise<string> {
  if (tokenGate) return tokenGate;
  tokenGate = (async () => {
    try {
      const session = await getMedicoverSession();
      const now = Math.floor(Date.now() / 1000);
      if (session.accessToken && session.expiresAt && session.expiresAt - 60 > now) {
        return session.accessToken;
      }
      if (session.refreshToken) {
        try {
          const tokens = await refreshTokens(session.refreshToken);
          await persistTokens(tokens);
          return tokens.accessToken;
        } catch {
          // fall through to password login
        }
      }
      const { medicoverUser, medicoverPass } = await getSettings();
      if (!medicoverUser || !medicoverPass) {
        await saveMedicoverSession({
          status: "disconnected",
          statusDetail: "Missing Medicover credentials",
        });
        throw new MedicoverAuthError("Medicover credentials are not configured");
      }
      try {
        const tokens = await passwordLogin(medicoverUser, medicoverPass, session.deviceId);
        await persistTokens(tokens);
        return tokens.accessToken;
      } catch (err) {
        if (err instanceof MfaInteractionRequired) {
          setPendingLogin(err.state);
          await saveMedicoverSession({
            status: "action_required",
            statusDetail:
              err.state.kind === "mfa_setup"
                ? "Medicover requires one-time MFA setup — open Settings to finish connecting"
                : "Medicover sent a verification code — open Settings to enter it",
          });
        } else if (err instanceof MedicoverAuthError) {
          await saveMedicoverSession({ status: "disconnected", statusDetail: err.message });
        }
        throw err;
      }
    } finally {
      tokenGate = null;
    }
  })();
  return tokenGate;
}

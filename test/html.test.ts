import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  extractPageError,
  pageText,
  parseForms,
} from "@/server/medicover/html";

// Trimmed from a real login-online24.medicover.pl MfaGate response.
const MFA_GATE_HTML = `
<!DOCTYPE html><html lang="pl"><body>
<form action="/Account/MfaGate?ReturnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3Dweb%26state%3Dabc" method="post">
    <input type="hidden" id="returnUrlInput" name="Input.ReturnUrl" value="/connect/authorize/callback?client_id=web&amp;redirect_uri=https%3A%2F%2Fonline24.medicover.pl%2Fsignin-oidc&amp;state=abc" />
    <button class="secondary" x-show="false" formaction="/Account/MfaGate?handler=SkipMfaGate">Pomi&#x144;</button>
    <button class="m-0" formaction="/Account/MfaGate?handler=AddAuthenticator">W&#x142;&#x105;cz MFA</button>
<input name="__RequestVerificationToken" type="hidden" value="CfDJ8-TOKEN" /></form>
</body></html>`;

const LOGIN_ERROR_HTML = `
<div class="validation-summary-errors alert-error"><ul><li>Niepoprawny login lub has&#x142;o.</li></ul></div>`;

describe("parseForms", () => {
  it("extracts action, hidden fields and button formactions", () => {
    const forms = parseForms(MFA_GATE_HTML);
    expect(forms).toHaveLength(1);
    const form = forms[0];
    expect(form.action).toContain("/Account/MfaGate?ReturnUrl=");
    expect(form.fields["__RequestVerificationToken"]).toBe("CfDJ8-TOKEN");
    // HTML entities in the ReturnUrl must be decoded to raw '&'.
    expect(form.fields["Input.ReturnUrl"]).toContain(
      "client_id=web&redirect_uri=https%3A%2F%2Fonline24.medicover.pl%2Fsignin-oidc",
    );
    expect(form.buttonActions).toEqual([
      "/Account/MfaGate?handler=SkipMfaGate",
      "/Account/MfaGate?handler=AddAuthenticator",
    ]);
  });

  it("skips unchecked radio inputs", () => {
    const html = `<form action="/x">
      <input type="radio" name="Input.Channel" value="Email"/>
      <input type="radio" name="Input.Channel" value="SMS" checked />
    </form>`;
    expect(parseForms(html)[0].fields["Input.Channel"]).toBe("SMS");
  });
});

describe("decodeEntities", () => {
  it("handles the entities Medicover pages actually use", () => {
    expect(decodeEntities("Pomi&#x144;")).toBe("Pomiń");
    expect(decodeEntities("a&amp;b &quot;c&quot;")).toBe('a&b "c"');
  });
});

describe("extractPageError", () => {
  it("finds validation summaries", () => {
    expect(extractPageError(LOGIN_ERROR_HTML)).toContain("Niepoprawny login");
  });
  it("returns undefined when the page is clean", () => {
    expect(extractPageError("<div>wszystko ok</div>")).toBeUndefined();
  });
});

describe("pageText", () => {
  it("strips tags and scripts", () => {
    expect(pageText("<script>var x=1</script><p>Hello  <b>world</b></p>")).toBe(
      "Hello world",
    );
  });
});

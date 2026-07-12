import { describe, expect, it } from "vitest";
import { CookieJar } from "@/server/medicover/cookiejar";

const responseWithCookies = (cookies: string[]): Response => {
  const res = new Response("", { status: 200 });
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
};

describe("CookieJar", () => {
  it("stores cookies per host and replays them", () => {
    const jar = new CookieJar();
    jar.absorb(
      "https://login-online24.medicover.pl/x",
      responseWithCookies(["a=1; Path=/; HttpOnly", "b=2; Secure"]),
    );
    expect(jar.header("https://login-online24.medicover.pl/y")).toBe("a=1; b=2");
    expect(jar.header("https://online24.medicover.pl/")).toBeUndefined();
  });

  it("overwrites cookies with the same name", () => {
    const jar = new CookieJar();
    const url = "https://login-online24.medicover.pl/";
    jar.absorb(url, responseWithCookies(["orch_state=first"]));
    jar.absorb(url, responseWithCookies(["orch_state=second"]));
    expect(jar.header(url)).toBe("orch_state=second");
  });

  it("keeps values containing '='", () => {
    const jar = new CookieJar();
    const url = "https://login-online24.medicover.pl/";
    jar.absorb(url, responseWithCookies(["tok=abc==; Path=/"]));
    expect(jar.header(url)).toBe("tok=abc==");
  });

  it("round-trips through JSON (pending-login persistence)", () => {
    const jar = new CookieJar();
    const url = "https://login-online24.medicover.pl/";
    jar.absorb(url, responseWithCookies(["a=1"]));
    const restored = CookieJar.fromJSON(jar.toJSON());
    expect(restored.header(url)).toBe("a=1");
  });
});

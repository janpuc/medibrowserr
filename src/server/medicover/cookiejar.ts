/**
 * Minimal per-host cookie jar for the login orchestration. The flow only
 * touches login-online24.medicover.pl, so host-scoped storage is enough.
 */
export class CookieJar {
  private store = new Map<string, Map<string, string>>();

  absorb(url: string, res: Response): void {
    const host = new URL(url).host;
    const cookies = res.headers.getSetCookie?.() ?? [];
    if (!this.store.has(host)) this.store.set(host, new Map());
    const m = this.store.get(host)!;
    for (const c of cookies) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      m.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(url: string): string | undefined {
    const m = this.store.get(new URL(url).host);
    if (!m || m.size === 0) return undefined;
    return [...m.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  toJSON(): Record<string, Record<string, string>> {
    return Object.fromEntries(
      [...this.store.entries()].map(([h, m]) => [h, Object.fromEntries(m)]),
    );
  }

  static fromJSON(data: Record<string, Record<string, string>>): CookieJar {
    const jar = new CookieJar();
    for (const [h, cookies] of Object.entries(data)) {
      jar.store.set(h, new Map(Object.entries(cookies)));
    }
    return jar;
  }
}

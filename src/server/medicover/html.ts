/**
 * Tiny HTML helpers for the login-orchestration pages (Razor Pages forms).
 * Deliberately regex-based: the pages are small, server-rendered and stable,
 * and pulling in a DOM parser for three forms isn't worth the dependency.
 */

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export interface ParsedForm {
  action: string;
  /** name -> value for every <input> that carries a name. */
  fields: Record<string, string>;
  /** formaction attributes of submit buttons, e.g. handler overrides. */
  buttonActions: string[];
}

/** Parses the first (or action-matching) <form> out of a login page. */
export function parseForms(html: string): ParsedForm[] {
  const forms: ParsedForm[] = [];
  for (const m of html.matchAll(/<form[\s\S]*?<\/form>/g)) {
    const formHtml = m[0];
    const action = decodeEntities(formHtml.match(/action="([^"]*)"/)?.[1] ?? "");
    const fields: Record<string, string> = {};
    for (const input of formHtml.matchAll(/<input[^>]*>/g)) {
      const tag = input[0];
      const name = tag.match(/name="([^"]+)"/)?.[1];
      if (!name) continue;
      const type = tag.match(/type="([^"]+)"/)?.[1] ?? "text";
      // Radio buttons: only take a checked one; otherwise leave unset.
      if (type === "radio" && !/checked/i.test(tag)) continue;
      fields[name] = decodeEntities(tag.match(/value="([^"]*)"/)?.[1] ?? "");
    }
    const buttonActions = [...formHtml.matchAll(/formaction="([^"]+)"/g)].map((b) =>
      decodeEntities(b[1]),
    );
    forms.push({ action, fields, buttonActions });
  }
  return forms;
}

/** Pulls a human-readable error message out of a login page, if any. */
export function extractPageError(html: string): string | undefined {
  const candidates = [
    ...html.matchAll(
      /<(?:div|span|li)[^>]*class="[^"]*(?:alert|error|validation-summary)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span|li)>/gi,
    ),
  ]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 3);
  return candidates[0];
}

/** Strips tags for logging/diagnostics. */
export function pageText(html: string, limit = 400): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/g, " ")
      .replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

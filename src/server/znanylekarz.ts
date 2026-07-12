import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

const ZL_BASE = "https://www.znanylekarz.pl";
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export interface DoctorEnrichment {
  /** Direct profile link when we could resolve one. */
  profileUrl?: string;
  /** Doctor photo when the profile exposes one via OpenGraph. */
  photoUrl?: string;
  rating?: number;
  reviewCount?: number;
  /** Always present: a search link the user can click regardless. */
  searchUrl: string;
}

/**
 * Best-effort znanylekarz.pl lookup. Their JSON APIs are auth-gated, so this
 * scrapes the public search page for a profile link, then reads OpenGraph
 * tags off the profile. Every failure degrades to just the search link.
 */
export async function enrichDoctor(name: string): Promise<DoctorEnrichment> {
  const clean = name
    .replace(/\b(dr|lek|prof|med|hab|n\.)\.?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const searchUrl = `${ZL_BASE}/szukaj?q=${encodeURIComponent(clean)}`;
  if (!clean) return { searchUrl };

  const cacheKey = `zl:${clean.toLocaleLowerCase("pl")}`;
  const db = await getDb();
  const cached = await db
    .select()
    .from(schema.dictCache)
    .where(eq(schema.dictCache.key, cacheKey));
  if (cached.length && Date.now() - cached[0].fetchedAt < CACHE_TTL_MS) {
    try {
      return JSON.parse(cached[0].value) as DoctorEnrichment;
    } catch {
      /* re-fetch below */
    }
  }

  let result: DoctorEnrichment = { searchUrl };
  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "pl" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      // Doctor profile URLs look like /<slug>/<specialization>/<city>.
      const profilePath = html.match(
        /href="(?:https:\/\/www\.znanylekarz\.pl)?(\/[a-z0-9-]+\/[a-z0-9,-]+\/[a-z0-9-]+)"/i,
      )?.[1];
      if (profilePath) {
        const profileUrl = ZL_BASE + profilePath;
        const prof = await fetch(profileUrl, {
          headers: { "User-Agent": UA, "Accept-Language": "pl" },
          signal: AbortSignal.timeout(8000),
        });
        if (prof.ok) {
          const profHtml = await prof.text();
          const photo = profHtml.match(
            /property="og:image"\s+content="([^"]+)"/,
          )?.[1];
          const rating = profHtml.match(/"ratingValue"\s*:\s*"?([\d.]+)/)?.[1];
          const reviews = profHtml.match(/"(?:ratingCount|reviewCount)"\s*:\s*"?(\d+)/)?.[1];
          result = {
            searchUrl,
            profileUrl,
            photoUrl: photo && !photo.includes("default") ? photo : undefined,
            rating: rating ? Number(rating) : undefined,
            reviewCount: reviews ? Number(reviews) : undefined,
          };
        } else {
          result = { searchUrl, profileUrl };
        }
      }
    }
  } catch {
    // Network/parse trouble → search link only.
  }

  await db
    .insert(schema.dictCache)
    .values({ key: cacheKey, value: JSON.stringify(result), fetchedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.dictCache.key,
      set: { value: JSON.stringify(result), fetchedAt: Date.now() },
    });
  return result;
}

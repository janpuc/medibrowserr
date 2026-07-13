/** Fuzzy matching between a coverage-service name and search specialties. */

export interface FuzzyOption {
  id: string;
  value: string;
}

const STOPWORDS = new Set(["konsultacja", "wizyta", "badanie", "usluga", "porada"]);

const normalize = (s: string): string[] =>
  s
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);

const tokensMatch = (a: string, b: string): boolean => {
  if (a.length < 4 || b.length < 4) return a === b;
  // Polish inflection: "kardiologa" ~ "kardiolog" — prefix containment.
  return a.startsWith(b) || b.startsWith(a);
};

/**
 * Picks the specialty that best matches a service name, e.g.
 * "Konsultacja kardiologa" → "Kardiolog dorośli". Returns null when nothing
 * plausibly matches. Adult variants win unless the hint mentions children.
 */
export function matchSpecialty(hint: string, options: FuzzyOption[]): FuzzyOption | null {
  const hintTokens = normalize(hint).filter((t) => !STOPWORDS.has(t));
  if (!hintTokens.length) return null;
  const hintMentionsChildren = hintTokens.some((t) => t.startsWith("dzieci") || t.startsWith("dziec"));

  let best: FuzzyOption | null = null;
  let bestScore = 0;
  for (const option of options) {
    const optionTokens = normalize(option.value);
    let score = 0;
    for (const ot of optionTokens) {
      if (STOPWORDS.has(ot)) continue;
      if (hintTokens.some((ht) => tokensMatch(ht, ot))) score += 1;
    }
    if (score === 0) continue;
    const mentionsChildren = optionTokens.some((t) => t.startsWith("dzieci") || t.startsWith("dziec"));
    if (mentionsChildren !== hintMentionsChildren) score -= 0.5;
    if (
      score > bestScore ||
      (score === bestScore && best && option.value.length < best.value.length)
    ) {
      best = option;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

import type { ProductSummary } from "@/server/medicover/types";

/**
 * How the user's plan treats a service, best case across product rows.
 * `covered_referral` is deliberately counted as "in plan": services that are
 * free after a referral from a Medicover doctor (the criteria end up in the
 * footnote) — that's how plan holders read their coverage.
 */
export type Verdict = "covered" | "covered_referral" | "discount" | "fixed_price" | "payable";

export const IN_PLAN_VERDICTS: Verdict[] = ["covered", "covered_referral"];

export interface ClassifiedCoverage {
  verdict: Verdict;
  referralRequired: boolean;
  discount: number | null;
  fixedPayment: number | null;
  volumeLimit: number | null;
  volumeUsed: number | null;
  valueLimit: number | null;
  valueUsed: number | null;
  productName: string | null;
  planName: string | null;
  remarks: string[];
}

const RANK: Record<Verdict, number> = {
  covered: 4,
  covered_referral: 3,
  discount: 2,
  fixed_price: 1,
  payable: 0,
};

function classifyRow(row: ProductSummary): Verdict {
  if (row.isFreeAsPartOfBenefit) return "covered";
  if (row.referralRequired) return "covered_referral";
  if (row.hasDiscount && (row.discount ?? 0) > 0) return "discount";
  if (row.fixedPayment) return "fixed_price";
  return "payable";
}

/** Picks the most favourable product row and flattens it for storage. */
export function classifyCoverage(summaries: ProductSummary[] | undefined): ClassifiedCoverage {
  const rows = summaries ?? [];
  let best: ProductSummary | null = null;
  let bestVerdict: Verdict = "payable";
  for (const row of rows) {
    const verdict = classifyRow(row);
    if (!best || RANK[verdict] > RANK[bestVerdict]) {
      best = row;
      bestVerdict = verdict;
    }
  }
  return {
    verdict: bestVerdict,
    referralRequired: Boolean(best?.referralRequired),
    discount: best?.hasDiscount ? (best.discount ?? null) : null,
    fixedPayment: best?.fixedPayment ?? null,
    volumeLimit: best?.hasVolumeLimit ? (best.volumeLimit ?? null) : null,
    volumeUsed: best?.hasVolumeLimit ? (best.volumeUsedCount ?? 0) : null,
    valueLimit: best?.hasValueLimit ? (best.valueLimit ?? null) : null,
    valueUsed: best?.hasValueLimit ? (best.valueUsedCount ?? 0) : null,
    productName: best?.product?.productName ?? null,
    planName: best?.benefitPlanName ?? null,
    remarks: (rows.flatMap((r) => r.remarks ?? []) as string[]).filter(
      (r, i, all) => all.indexOf(r) === i,
    ),
  };
}

import { describe, expect, it } from "vitest";
import { classifyCoverage } from "@/server/coverage/verdict";
import type { ProductSummary } from "@/server/medicover/types";

const row = (over: Partial<ProductSummary>): ProductSummary => ({
  referralRequired: false,
  discount: 0,
  hasDiscount: false,
  hasValueLimit: false,
  hasVolumeLimit: false,
  isFreeAsPartOfBenefit: false,
  fixedPayment: null,
  ...over,
});

describe("classifyCoverage", () => {
  it("marks free-as-part-of-benefit as covered", () => {
    const c = classifyCoverage([row({ isFreeAsPartOfBenefit: true })]);
    expect(c.verdict).toBe("covered");
  });

  it("treats referral-required services as included (user reads them as covered)", () => {
    const c = classifyCoverage([
      row({
        referralRequired: true,
        remarks: [
          "Usługi bezpłatne po skierowaniu od lekarza Placówki Medycznej Medicover",
          "Usługi płatne w przypadku braku skierowania od lekarza Placówki Medycznej Medicover",
        ],
      }),
    ]);
    expect(c.verdict).toBe("covered_referral");
    expect(c.referralRequired).toBe(true);
    expect(c.remarks).toHaveLength(2);
  });

  it("classifies discounts and fixed prices", () => {
    expect(classifyCoverage([row({ hasDiscount: true, discount: 20 })]).verdict).toBe("discount");
    expect(classifyCoverage([row({ fixedPayment: 150 })]).verdict).toBe("fixed_price");
  });

  it("falls back to payable for empty or unmatched summaries", () => {
    expect(classifyCoverage([]).verdict).toBe("payable");
    expect(classifyCoverage(undefined).verdict).toBe("payable");
    expect(classifyCoverage([row({})]).verdict).toBe("payable");
  });

  it("picks the most favourable row and keeps its limits", () => {
    const c = classifyCoverage([
      row({ fixedPayment: 100 }),
      row({ isFreeAsPartOfBenefit: true, hasVolumeLimit: true, volumeLimit: 2, volumeUsedCount: 1 }),
    ]);
    expect(c.verdict).toBe("covered");
    expect(c.volumeLimit).toBe(2);
    expect(c.volumeUsed).toBe(1);
  });

  it("dedupes remarks across rows", () => {
    const c = classifyCoverage([row({ remarks: ["a", "b"] }), row({ remarks: ["b", "c"] })]);
    expect(c.remarks).toEqual(["a", "b", "c"]);
  });
});

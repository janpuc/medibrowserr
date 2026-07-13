import { describe, expect, it } from "vitest";
import { dedupeOptions } from "@/components/multi-select";

describe("dedupeOptions", () => {
  it("drops duplicate ids, keeping the first entry", () => {
    const out = dedupeOptions([
      { id: "13038", value: "Centrum Medicover Podgórska" },
      { id: "91164", value: "Centrum Medicover Czerwone Maki" },
      { id: "13038", value: "Centrum Medicover Podgórska (dup)" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].value).toBe("Centrum Medicover Podgórska");
  });

  it("treats padded and numeric-ish ids as the same entry", () => {
    const out = dedupeOptions([
      { id: "13038", value: "A" },
      { id: " 13038 ", value: "B" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("keeps distinct ids intact and preserves order", () => {
    const out = dedupeOptions([
      { id: "2", value: "b" },
      { id: "1", value: "a" },
    ]);
    expect(out.map((o) => o.id)).toEqual(["2", "1"]);
  });
});

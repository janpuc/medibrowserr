import { describe, expect, it } from "vitest";
import {
  buildGoneNotification,
  buildNotification,
  formatSlotDate,
  renderSlotLine,
  SYSTEM_MESSAGES,
} from "@/server/notify/messages";
import type { Slot } from "@/server/medicover/types";

const slot = (over: Partial<Slot> = {}): Slot => ({
  appointmentDate: "2026-07-15T10:30:00",
  clinic: { id: "1", name: "Warszawa Atrium" },
  doctor: { id: "2", name: "Anna Kowalska" },
  specialty: { id: "3", name: "Kardiolog" },
  visitType: "Center",
  ...over,
});

describe("formatSlotDate", () => {
  it("renders Polish-style timestamps without timezone shifts", () => {
    expect(formatSlotDate("2026-07-15T10:30:00")).toBe("15.07.2026 10:30");
  });
});

describe("buildNotification (default messages)", () => {
  it("writes the Polish default with correct plural forms", () => {
    const one = buildNotification("Kardiolog", "Kardiolog", [slot()], "pl");
    expect(one.title).toBe("🩺 Kardiolog: nowy termin");
    expect(one.message).toContain("15.07.2026 10:30 — Anna Kowalska");
    expect(one.message).toContain("Warszawa Atrium");
    expect(one.message).toContain("Zarezerwuj szybko");

    const three = buildNotification("K", undefined, [slot(), slot(), slot()], "pl");
    expect(three.title).toContain("3 nowe terminy");
    const seven = buildNotification("K", undefined, Array(7).fill(slot()), "pl");
    expect(seven.title).toContain("7 nowych terminów");
  });

  it("keeps emoji to the title only", () => {
    const res = buildNotification("K", "Kardiolog", [slot(), slot()], "pl");
    const emojiCount = [...res.message].filter((ch) => /\p{Extended_Pictographic}/u.test(ch)).length;
    expect(emojiCount).toBe(0);
    expect(res.title).toContain("🩺");
  });

  it("writes the English default", () => {
    const res = buildNotification("Cardiology watch", "Kardiolog", [slot(), slot()], "en");
    expect(res.title).toBe("🩺 Cardiology watch: 2 new appointments");
    expect(res.message).toContain("Specialty: Kardiolog");
    expect(res.message).toContain("Book quickly");
  });

  it("stays tidy for a single slot (no specialty header)", () => {
    const res = buildNotification("K", "Kardiolog", [slot()], "en");
    expect(res.message).not.toContain("Specialty:");
    expect(res.message.split("\n\n")).toHaveLength(2); // slot block + footer
  });

  it("summarizes big batches with the latest date (50 slots)", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      slot({ appointmentDate: `2026-07-${String(15 + (i % 14)).padStart(2, "0")}T10:30:00` }),
    ).sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate));
    const res = buildNotification("K", undefined, many, "en");
    expect(res.title).toContain("50 new appointments");
    expect(res.message).toContain("…and 44 more, latest 28.07.2026.");
    // 6 slot blocks + summary + footer — not 100 lines of noise.
    expect(res.message.split("\n").length).toBeLessThanOrEqual(22);
  });

  it("annotates only non-standard visit types", () => {
    expect(renderSlotLine(slot(), "pl", null)).not.toContain("wizyta");
    expect(
      renderSlotLine(slot({ visitType: "PhoneConsultation" }), "pl", null),
    ).toContain("(telekonsultacja)");
  });
});

describe("renderSlotLine (custom templates)", () => {
  it("substitutes every token", () => {
    const line = renderSlotLine(
      slot(),
      "pl",
      "{date} {time} — {doctor} @ {clinic} ({specialty})",
    );
    expect(line).toBe(
      "15.07.2026 10:30 — Anna Kowalska @ Warszawa Atrium (Kardiolog)",
    );
  });

  it("supports \\n line breaks and {datetime}", () => {
    expect(renderSlotLine(slot(), "en", "{datetime}\\n{doctor}")).toBe(
      "15.07.2026 10:30\nAnna Kowalska",
    );
  });

  it("falls back to the default line when the template is empty", () => {
    expect(renderSlotLine(slot(), "pl", "  ")).toBe(
      "15.07.2026 10:30 — Anna Kowalska\nWarszawa Atrium",
    );
  });

  it("feeds through buildNotification", () => {
    const res = buildNotification("K", undefined, [slot()], "pl", "{time} {doctor}");
    expect(res.message).toContain("10:30 Anna Kowalska");
    expect(res.message).not.toContain("📅");
  });
});

describe("buildGoneNotification", () => {
  it("writes the Polish gone message with plural forms", () => {
    const one = buildGoneNotification("Kardiolog", [slot()], "pl");
    expect(one.title).toBe("📉 Kardiolog: termin zniknął");
    expect(one.message).toContain("Ktoś był szybszy");

    const three = buildGoneNotification("K", [slot(), slot(), slot()], "pl");
    expect(three.title).toContain("3 terminy zniknęły");
    const seven = buildGoneNotification("K", Array(7).fill(slot()), "pl");
    expect(seven.title).toContain("7 terminów zniknęło");
  });

  it("writes the English gone message", () => {
    const res = buildGoneNotification("Cardio", [slot(), slot()], "en");
    expect(res.title).toBe("📉 Cardio: 2 slots are gone");
    expect(res.message).toContain("Someone was quicker");
  });
});

describe("SYSTEM_MESSAGES", () => {
  it("ships both languages for every message", () => {
    for (const lang of ["pl", "en"] as const) {
      expect(SYSTEM_MESSAGES[lang].testTitle).toBeTruthy();
      expect(SYSTEM_MESSAGES[lang].actionRequiredBody).toBeTruthy();
    }
  });
});

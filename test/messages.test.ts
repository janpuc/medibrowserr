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
    expect(one.message).toContain("15.07.2026 10:30");
    expect(one.message).toContain("Anna Kowalska");
    expect(one.message).toContain("Warszawa Atrium");
    expect(one.message).toContain("Zarezerwuj szybko");

    const three = buildNotification("K", undefined, [slot(), slot(), slot()], "pl");
    expect(three.title).toContain("3 nowe terminy");
    const seven = buildNotification("K", undefined, Array(7).fill(slot()), "pl");
    expect(seven.title).toContain("7 nowych terminów");
  });

  it("writes the English default", () => {
    const res = buildNotification("Cardiology watch", "Kardiolog", [slot()], "en");
    expect(res.title).toBe("🩺 Cardiology watch: new appointment");
    expect(res.message).toContain("Specialty: Kardiolog");
    expect(res.message).toContain("Book quickly");
  });

  it("caps the list and mentions the remainder", () => {
    const many = buildNotification("K", undefined, Array(10).fill(slot()), "en");
    expect(many.message).toContain("…and 4 more slots.");
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
    expect(renderSlotLine(slot(), "pl", "  ")).toContain("📅 15.07.2026 10:30");
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

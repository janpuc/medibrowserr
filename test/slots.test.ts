import { describe, expect, it } from "vitest";
import { applyDoctorNameFilter, filterSlots } from "@/server/medicover/slots";
import type { Slot } from "@/server/medicover/types";

const slot = (date: string, doctor = "Anna Kowalska"): Slot => ({
  appointmentDate: date,
  clinic: { id: "1", name: "C" },
  doctor: { id: "2", name: doctor },
  specialty: { id: "3", name: "S" },
});

describe("filterSlots", () => {
  const slots = [
    slot("2026-07-15T07:30:00"),
    slot("2026-07-15T12:00:00"),
    slot("2026-07-20T18:15:00"),
  ];

  it("applies the inclusive end date", () => {
    const out = filterSlots(slots, { regionIds: [], specialtyIds: [], endDate: "2026-07-15" });
    expect(out).toHaveLength(2);
  });

  it("applies the hour window (start inclusive, end exclusive)", () => {
    const out = filterSlots(slots, {
      regionIds: [],
      specialtyIds: [],
      startHour: 8,
      endHour: 18,
    });
    expect(out.map((s) => s.appointmentDate)).toEqual(["2026-07-15T12:00:00"]);
  });

  it("sorts chronologically", () => {
    const out = filterSlots([slots[2], slots[0]], { regionIds: [], specialtyIds: [] });
    expect(out[0].appointmentDate).toBe("2026-07-15T07:30:00");
  });
});

describe("applyDoctorNameFilter", () => {
  const slots = [slot("2026-07-15T10:00:00", "Anna KOWALSKA"), slot("2026-07-15T11:00:00", "Jan Nowak")];

  it("matches case-insensitively including Polish characters", () => {
    expect(applyDoctorNameFilter(slots, "kowalska")).toHaveLength(1);
    expect(applyDoctorNameFilter(slots, "ŁÓDŹ")).toHaveLength(0);
  });

  it("passes everything through when empty", () => {
    expect(applyDoctorNameFilter(slots, null)).toHaveLength(2);
    expect(applyDoctorNameFilter(slots, "  ")).toHaveLength(2);
  });
});

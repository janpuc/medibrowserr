import { describe, expect, it } from "vitest";
import {
  applyDoctorNameFilter,
  filterSlots,
  nowWarsawIso,
  splitGoneCandidates,
} from "@/server/medicover/slots";
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

describe("splitGoneCandidates", () => {
  const now = "2026-07-15T12:00:00";
  const rows = [
    { id: 1, dedupeKey: "a", appointmentDate: "2026-07-16T09:00:00" }, // future, still present
    { id: 2, dedupeKey: "b", appointmentDate: "2026-07-16T10:00:00" }, // future, vanished → taken
    { id: 3, dedupeKey: "c", appointmentDate: "2026-07-15T08:00:00" }, // past, vanished → expired
  ];

  it("classifies vanished future slots as taken and past ones as expired", () => {
    const { taken, expired } = splitGoneCandidates(rows, new Set(["a"]), now);
    expect(taken.map((r) => r.id)).toEqual([2]);
    expect(expired.map((r) => r.id)).toEqual([3]);
  });

  it("does nothing when every active slot is still present", () => {
    const { taken, expired } = splitGoneCandidates(rows, new Set(["a", "b", "c"]), now);
    expect(taken).toHaveLength(0);
    expect(expired).toHaveLength(0);
  });
});

describe("nowWarsawIso", () => {
  it("emits the API's local-time format, comparable to appointmentDate", () => {
    expect(nowWarsawIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
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

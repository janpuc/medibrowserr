import { describe, expect, it } from "vitest";
import { isQuietHour, parseQuietHours } from "@/server/notify/quiet";

describe("parseQuietHours", () => {
  it("parses simple and spaced ranges", () => {
    expect(parseQuietHours("23-7")).toEqual({ start: 23, end: 7 });
    expect(parseQuietHours(" 8 - 17 ")).toEqual({ start: 8, end: 17 });
  });
  it("rejects nonsense", () => {
    expect(parseQuietHours("25-7")).toBeNull();
    expect(parseQuietHours("7-7")).toBeNull();
    expect(parseQuietHours("night")).toBeNull();
  });
});

describe("isQuietHour", () => {
  it("handles ranges wrapping midnight (23-7)", () => {
    expect(isQuietHour(23, "23-7")).toBe(true);
    expect(isQuietHour(2, "23-7")).toBe(true);
    expect(isQuietHour(6, "23-7")).toBe(true);
    expect(isQuietHour(7, "23-7")).toBe(false);
    expect(isQuietHour(12, "23-7")).toBe(false);
  });
  it("handles same-day ranges (13-15)", () => {
    expect(isQuietHour(13, "13-15")).toBe(true);
    expect(isQuietHour(15, "13-15")).toBe(false);
  });
  it("is inert for invalid ranges", () => {
    expect(isQuietHour(3, "banana")).toBe(false);
  });
});

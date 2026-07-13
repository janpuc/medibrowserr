import { describe, expect, it } from "vitest";
import { matchSpecialty } from "@/lib/fuzzy";

const SPECIALTIES = [
  { id: "176", value: "Alergolog dorośli" },
  { id: "132", value: "Kardiolog dorośli" },
  { id: "133", value: "Kardiolog dzieci" },
  { id: "9", value: "Internista" },
  { id: "2986", value: "USG jamy brzusznej - dorośli" },
  { id: "163", value: "Ortopeda dorośli" },
];

describe("matchSpecialty", () => {
  it("matches inflected Polish service names to specialties", () => {
    expect(matchSpecialty("Konsultacja kardiologa", SPECIALTIES)?.id).toBe("132");
    expect(matchSpecialty("Konsultacja ortopedy dorośli", SPECIALTIES)?.id).toBe("163");
  });

  it("prefers the adult variant unless the hint mentions children", () => {
    expect(matchSpecialty("Konsultacja kardiologa", SPECIALTIES)?.value).toBe(
      "Kardiolog dorośli",
    );
    expect(matchSpecialty("Konsultacja kardiologa dzieci", SPECIALTIES)?.value).toBe(
      "Kardiolog dzieci",
    );
  });

  it("matches multi-word diagnostic names", () => {
    expect(matchSpecialty("USG jamy brzusznej", SPECIALTIES)?.id).toBe("2986");
  });

  it("returns null when nothing plausibly matches", () => {
    expect(matchSpecialty("Rezonans magnetyczny głowy", SPECIALTIES)).toBeNull();
    expect(matchSpecialty("", SPECIALTIES)).toBeNull();
  });
});

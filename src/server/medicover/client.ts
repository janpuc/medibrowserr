import "server-only";
import { API_URL, MAIN_URL, USER_AGENT, ensureAccessToken } from "./auth";
import { filterSlots, isoToday } from "./slots";
import type {
  BenefitPlan,
  CoverageService,
  CoverageServicePage,
  CoverageSummary,
  FiltersResponse,
  PersonAppointment,
  PersonalData,
  Slot,
  SlotSearchParams,
} from "./types";

export class MedicoverApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
  ) {
    super(message);
    this.name = "MedicoverApiError";
  }
}

/**
 * The filters endpoint refuses region-less requests (409 CIS_ERROR), so the
 * initial regions dictionary is fetched with an arbitrary seed region —
 * the `regions` array in the response is always the full national list.
 */
const SEED_REGION_ID = 204; // Warszawa

async function apiGet<T>(path: string, params?: Iterable<[string, string]>): Promise<T> {
  const token = await ensureAccessToken();
  const url = new URL(API_URL + path);
  for (const [k, v] of params ?? []) url.searchParams.append(k, v);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      Origin: MAIN_URL,
      Referer: `${MAIN_URL}/`,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });
  const body = await res.text();
  if (!res.ok) {
    throw new MedicoverApiError(
      `Medicover API ${path} failed (${res.status})`,
      res.status,
      body.slice(0, 500),
    );
  }
  return JSON.parse(body) as T;
}

/**
 * Search dictionaries (regions, specialties, clinics, doctors) scoped by the
 * current selection. Multi-region works by merging per-region responses —
 * per-region requests are guaranteed to behave like the official app.
 * Clinics and doctors only populate once specialties are chosen (API rule).
 */
export async function getFilters(opts: {
  regionIds?: number[];
  specialtyIds?: number[];
  slotSearchType?: string;
}): Promise<FiltersResponse> {
  const slotSearchType = opts.slotSearchType ?? "Standard";
  const regions = opts.regionIds?.length ? opts.regionIds : [SEED_REGION_ID];
  const scoped = Boolean(opts.regionIds?.length);
  const merged: FiltersResponse = { regions: [], specialties: [], clinics: [], doctors: [] };
  const seen = { regions: new Set(), specialties: new Set(), clinics: new Set(), doctors: new Set() } as Record<
    keyof FiltersResponse,
    Set<string>
  >;
  for (const regionId of regions) {
    const params: [string, string][] = [
      ["SlotSearchType", slotSearchType],
      ["RegionIds", String(regionId)],
    ];
    for (const s of opts.specialtyIds ?? []) params.push(["SpecialtyIds", String(s)]);
    const res = await apiGet<Partial<FiltersResponse>>(
      "/appointments/api/v2/search-appointments/filters",
      params,
    );
    for (const key of ["regions", "specialties", "clinics", "doctors"] as const) {
      for (const item of res[key] ?? []) {
        if (!seen[key].has(item.id)) {
          seen[key].add(item.id);
          merged[key].push(item as never);
        }
      }
    }
  }
  // With no region picked yet, clinics/doctors from the seed region would
  // mislead the form — the pickers stay empty until a region is chosen.
  if (!scoped) {
    merged.clinics = [];
    merged.doctors = [];
  }
  const byValue = (a: { value: string }, b: { value: string }) =>
    a.value.localeCompare(b.value, "pl");
  merged.regions.sort(byValue);
  merged.specialties.sort(byValue);
  merged.clinics.sort(byValue);
  merged.doctors.sort(byValue);
  return merged;
}

/** Free-slot search; multi-region handled by merging per-region queries. */
export async function searchSlots(p: SlotSearchParams): Promise<Slot[]> {
  const startDate = p.startDate && p.startDate >= isoToday() ? p.startDate : isoToday();
  const all: Slot[] = [];
  const seen = new Set<string>();
  for (const regionId of p.regionIds) {
    const params: [string, string][] = [
      ["Page", "1"],
      ["PageSize", "5000"],
      ["RegionIds", String(regionId)],
      ["SlotSearchType", p.slotSearchType ?? "Standard"],
      ["StartTime", startDate],
      ["VisitType", "Center"],
      ["isOverbookingSearchDisabled", "false"],
    ];
    for (const s of p.specialtyIds) params.push(["SpecialtyIds", String(s)]);
    for (const c of p.clinicIds ?? []) params.push(["ClinicIds", String(c)]);
    for (const d of p.doctorIds ?? []) params.push(["DoctorIds", String(d)]);
    if (p.doctorLanguageId) params.push(["DoctorLanguageIds", String(p.doctorLanguageId)]);
    const res = await apiGet<{ items?: Slot[] }>(
      "/appointments/api/v2/search-appointments/slots",
      params,
    );
    for (const slot of res.items ?? []) {
      const key = `${slot.appointmentDate}|${slot.doctor?.id}|${slot.clinic?.id}|${slot.specialty?.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(slot);
      }
    }
  }
  return filterSlots(all, p);
}

export async function getPersonalData(): Promise<PersonalData> {
  return apiGet<PersonalData>("/personal-data/api/personal");
}

export async function getPersonAppointments(
  state: "Planned" | "Realized" = "Planned",
): Promise<PersonAppointment[]> {
  const res = await apiGet<{ items?: PersonAppointment[] }>(
    "/appointments/api/v2/person-appointments/appointments",
    [
      ["AppointmentState", state],
      ["Page", "1"],
      ["PageSize", "50"],
    ],
  );
  return res.items ?? [];
}

// --- coverage ("check my coverage") -----------------------------------------

export async function getBenefitPlans(): Promise<BenefitPlan[]> {
  const res = await apiGet<{ result?: BenefitPlan[] }>("/personal-data/api/benefit-plans");
  return res.result ?? [];
}

/** Empty query browses the full service catalog, paged. */
export async function searchCoveredServices(
  query: string,
  page = 1,
  pageSize = 25,
): Promise<CoverageServicePage> {
  const res = await apiGet<{ items?: CoverageService[] }>(
    "/personal-data/api/benefit-plans/autocomplete/medical-services",
    [
      ["QueryString", query],
      ["Page", String(page)],
      ["PageSize", String(pageSize)],
    ],
  );
  const items = res.items ?? [];
  return { items, page, hasMore: items.length === pageSize };
}

export async function getCoverageSummary(serviceId: string): Promise<CoverageSummary> {
  return apiGet<CoverageSummary>("/personal-data/api/benefit-plans/summary", [
    ["ServiceId", serviceId],
  ]);
}

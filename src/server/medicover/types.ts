/** Shapes returned by the api-gateway-online24 endpoints (v2). */

export interface IdName {
  id: string;
  name: string;
}

export interface IdValue {
  id: string;
  value: string;
}

export interface SpecialtyFilter extends IdValue {
  type?: string;
  kind?: string;
}

export interface FiltersResponse {
  regions: IdValue[];
  specialties: SpecialtyFilter[];
  clinics: IdValue[];
  doctors: IdValue[];
}

export interface Slot {
  appointmentDate: string; // local-time ISO, no offset: "2026-07-15T10:30:00"
  clinic: IdName;
  doctor: IdName | null;
  doctorLanguages?: IdName[];
  specialty: IdName;
  visitType?: string;
  bookingString?: string;
  isOverbooking?: boolean;
}

export interface SlotSearchParams {
  regionIds: number[];
  specialtyIds: number[];
  clinicIds?: number[];
  doctorIds?: number[];
  doctorLanguageId?: number;
  /** ISO date (YYYY-MM-DD); defaults to today. */
  startDate?: string;
  /** Inclusive ISO end date filter applied client-side. */
  endDate?: string;
  startHour?: number;
  endHour?: number;
  slotSearchType?: "Standard" | "DiagnosticProcedure";
}

export interface PersonalData {
  mrn?: number;
  firstName?: string;
  lastName?: string;
  homeClinicId?: string;
  email?: string;
}

export interface PersonAppointment {
  id: string;
  clinic?: IdName;
  doctor?: IdName;
  region?: IdName;
  specialty?: IdName;
  visitType?: string;
  date: string;
  state?: string;
}

/** Benefit-plan payloads are rendered defensively; shapes vary per contract. */
export type BenefitPlan = Record<string, unknown>;

export interface CoverageService {
  id?: string;
  serviceId?: string;
  name?: string;
  value?: string;
  [k: string]: unknown;
}

/** Shapes returned by the api-gateway-online24 endpoints (v2), as observed live. */

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

// --- coverage ---------------------------------------------------------------

export interface BenefitPlan {
  id: string;
  name: string;
  companyName?: string;
}

export interface CoverageService {
  serviceId: string;
  serviceName: string;
  serviceCode?: string;
  serviceDescription?: string | null;
}

export interface CoverageServicePage {
  items: CoverageService[];
  page: number;
  /** True when another page likely exists (a full page came back). */
  hasMore: boolean;
}

/** One row of "how does my plan treat this service". */
export interface ProductSummary {
  referralRequired?: boolean;
  discount?: number;
  hasDiscount?: boolean;
  hasValueLimit?: boolean;
  valueLimit?: number;
  valueUsedCount?: number;
  hasVolumeLimit?: boolean;
  volumeLimit?: number;
  volumeUsedCount?: number;
  remarks?: string[];
  benefitPlanName?: string;
  benefitPlanCompany?: string;
  isFreeAsPartOfBenefit?: boolean;
  fixedPayment?: number | null;
  product?: { productId?: number; productName?: string; benefitPlanId?: number };
}

export interface CoverageSummary {
  service?: CoverageService;
  productSummaries?: ProductSummary[];
}

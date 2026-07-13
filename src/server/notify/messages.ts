import type { Slot } from "@/server/medicover/types";

export type MessageLanguage = "pl" | "en";

/** "2026-07-15T10:30:00" → "15.07.2026 10:30" (string ops; API sends local time). */
export function formatSlotDate(iso: string): string {
  const [date, time] = iso.split("T");
  if (!date || !time) return iso;
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y} ${time.slice(0, 5)}`;
}

const VISIT_TYPE_LABELS: Record<MessageLanguage, Record<string, string>> = {
  pl: { PhoneConsultation: "telekonsultacja", OnlineConsultation: "konsultacja online" },
  en: { PhoneConsultation: "phone consultation", OnlineConsultation: "online consultation" },
};

/** Default per-slot line: date/time + doctor, clinic below. In-person visits
 * are the norm, so only phone/online consultations get annotated. */
export function slotLine(slot: Slot, lang: MessageLanguage): string {
  const head = [formatSlotDate(slot.appointmentDate), slot.doctor?.name]
    .filter(Boolean)
    .join(" — ");
  const visit = slot.visitType ? VISIT_TYPE_LABELS[lang][slot.visitType] : undefined;
  const clinicLine = [slot.clinic?.name, visit ? `(${visit})` : undefined]
    .filter(Boolean)
    .join(" ");
  return clinicLine ? `${head}\n${clinicLine}` : head;
}

/** Tokens available in per-monitor line templates. */
export const TEMPLATE_TOKENS = ["{datetime}", "{date}", "{time}", "{doctor}", "{clinic}", "{specialty}"] as const;

/** Renders one slot line: the monitor's custom template, or the default. */
export function renderSlotLine(
  slot: Slot,
  lang: MessageLanguage,
  template?: string | null,
): string {
  if (!template?.trim()) return slotLine(slot, lang);
  const formatted = formatSlotDate(slot.appointmentDate);
  const [date, time] = formatted.split(" ");
  return template
    .replaceAll("{datetime}", formatted)
    .replaceAll("{date}", date ?? "")
    .replaceAll("{time}", time ?? "")
    .replaceAll("{doctor}", slot.doctor?.name ?? "—")
    .replaceAll("{clinic}", slot.clinic?.name ?? "—")
    .replaceAll("{specialty}", slot.specialty?.name ?? "—")
    .replaceAll("\\n", "\n");
}

/**
 * Default notification messages ("sensible defaults") in Polish and English.
 * The language is chosen per monitor when the notification rule is created.
 */
/** How many slots are written out in full before summarizing the rest. */
const MAX_LINES = 6;

/** "…and 44 more, latest 28.07" — keeps 50-slot alerts readable. */
function moreSummary(rest: Slot[], lang: MessageLanguage): string {
  if (!rest.length) return "";
  const latest = rest[rest.length - 1]?.appointmentDate;
  const latestDay = latest ? formatSlotDate(latest).split(" ")[0] : undefined;
  if (lang === "pl") {
    return `\n\n…i jeszcze ${rest.length} — najpóźniejszy ${latestDay ?? "?"}.`;
  }
  return `\n\n…and ${rest.length} more, latest ${latestDay ?? "?"}.`;
}

export function buildNotification(
  monitorName: string,
  specialtyName: string | undefined,
  slots: Slot[],
  lang: MessageLanguage,
  lineTemplate?: string | null,
): { title: string; message: string } {
  const shown = slots.slice(0, MAX_LINES);
  const rest = slots.slice(MAX_LINES);
  const lines = shown.map((s) => renderSlotLine(s, lang, lineTemplate)).join("\n\n");
  // The specialty header only earns its line when several slots follow.
  const header =
    specialtyName && slots.length > 1
      ? `${lang === "pl" ? "Specjalizacja" : "Specialty"}: ${specialtyName}\n\n`
      : "";

  if (lang === "pl") {
    const count =
      slots.length === 1
        ? "nowy termin"
        : slots.length < 5
          ? `${slots.length} nowe terminy`
          : `${slots.length} nowych terminów`;
    return {
      title: `🩺 ${monitorName}: ${count}`,
      message:
        header +
        lines +
        moreSummary(rest, lang) +
        `\n\nZarezerwuj szybko w aplikacji Medicover, zanim ktoś Cię uprzedzi!`,
    };
  }
  const count = slots.length === 1 ? "new appointment" : `${slots.length} new appointments`;
  return {
    title: `🩺 ${monitorName}: ${count}`,
    message:
      header +
      lines +
      moreSummary(rest, lang) +
      `\n\nBook quickly in the Medicover app before someone else does!`,
  };
}

/**
 * Sent when previously-found future slots vanish from the results — someone
 * booked them. Delivered one priority step lower than the monitor's alerts.
 */
export function buildGoneNotification(
  monitorName: string,
  slots: Slot[],
  lang: MessageLanguage,
): { title: string; message: string } {
  const shown = slots.slice(0, MAX_LINES);
  const rest = slots.slice(MAX_LINES);
  const lines = shown.map((s) => slotLine(s, lang)).join("\n\n");

  if (lang === "pl") {
    const count =
      slots.length === 1
        ? "termin zniknął"
        : slots.length < 5
          ? `${slots.length} terminy zniknęły`
          : `${slots.length} terminów zniknęło`;
    return {
      title: `📉 ${monitorName}: ${count}`,
      message:
        lines +
        moreSummary(rest, lang) +
        `\n\nKtoś był szybszy — te terminy są już zajęte.`,
    };
  }
  const count = slots.length === 1 ? "slot is gone" : `${slots.length} slots are gone`;
  return {
    title: `📉 ${monitorName}: ${count}`,
    message:
      lines +
      moreSummary(rest, lang) +
      `\n\nSomeone was quicker — these slots are already taken.`,
  };
}

/** One-off messages the app sends outside of slot alerts. */
export const SYSTEM_MESSAGES: Record<
  MessageLanguage,
  { testTitle: string; testBody: string; actionRequiredTitle: string; actionRequiredBody: string }
> = {
  pl: {
    testTitle: "✅ Medibrowserr: test powiadomień",
    testBody: "Powiadomienia Pushover działają poprawnie. Powodzenia w polowaniu na terminy!",
    actionRequiredTitle: "⚠️ Medibrowserr: wymagane działanie",
    actionRequiredBody:
      "Logowanie do Medicover wymaga potwierdzenia (kod MFA). Otwórz Ustawienia aplikacji i dokończ łączenie konta.",
  },
  en: {
    testTitle: "✅ Medibrowserr: notification test",
    testBody: "Pushover notifications are working. Happy slot hunting!",
    actionRequiredTitle: "⚠️ Medibrowserr: action required",
    actionRequiredBody:
      "Signing in to Medicover needs your confirmation (MFA code). Open the app Settings and finish connecting the account.",
  },
};

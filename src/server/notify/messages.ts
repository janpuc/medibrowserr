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
  pl: { Center: "wizyta w centrum", PhoneConsultation: "telekonsultacja", OnlineConsultation: "konsultacja online" },
  en: { Center: "in-person", PhoneConsultation: "phone consultation", OnlineConsultation: "online consultation" },
};

export function slotLine(slot: Slot, lang: MessageLanguage): string {
  const parts = [
    `📅 ${formatSlotDate(slot.appointmentDate)}`,
    slot.doctor?.name ? `👨‍⚕️ ${slot.doctor.name}` : undefined,
    slot.clinic?.name ? `🏥 ${slot.clinic.name}` : undefined,
  ].filter(Boolean);
  const visit = slot.visitType && VISIT_TYPE_LABELS[lang][slot.visitType];
  return parts.join("\n") + (visit ? `\n💬 ${visit}` : "");
}

/**
 * Default notification messages ("sensible defaults") in Polish and English.
 * The language is chosen per monitor when the notification rule is created.
 */
export function buildNotification(
  monitorName: string,
  specialtyName: string | undefined,
  slots: Slot[],
  lang: MessageLanguage,
): { title: string; message: string } {
  const shown = slots.slice(0, 6);
  const more = slots.length - shown.length;
  const lines = shown.map((s) => slotLine(s, lang)).join("\n\n");

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
        `${specialtyName ? `Specjalizacja: ${specialtyName}\n\n` : ""}` +
        lines +
        (more > 0 ? `\n\n…i jeszcze ${more} innych terminów.` : "") +
        `\n\nZarezerwuj szybko w aplikacji Medicover, zanim ktoś Cię uprzedzi!`,
    };
  }
  const count = slots.length === 1 ? "new appointment" : `${slots.length} new appointments`;
  return {
    title: `🩺 ${monitorName}: ${count}`,
    message:
      `${specialtyName ? `Specialty: ${specialtyName}\n\n` : ""}` +
      lines +
      (more > 0 ? `\n\n…and ${more} more slots.` : "") +
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
  const shown = slots.slice(0, 6);
  const more = slots.length - shown.length;
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
        (more > 0 ? `\n\n…i jeszcze ${more} innych.` : "") +
        `\n\nKtoś był szybszy — te terminy są już zajęte.`,
    };
  }
  const count = slots.length === 1 ? "slot is gone" : `${slots.length} slots are gone`;
  return {
    title: `📉 ${monitorName}: ${count}`,
    message:
      lines +
      (more > 0 ? `\n\n…and ${more} more.` : "") +
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

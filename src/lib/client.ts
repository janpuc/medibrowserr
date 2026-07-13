"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Client-side view of a monitor row (JSON columns still stringified). */
export interface Monitor {
  id: number;
  name: string;
  regionIds: string;
  regionNames: string;
  specialtyIds: string;
  specialtyNames: string;
  clinicIds: string;
  clinicNames: string;
  doctorIds: string;
  doctorNames: string;
  doctorNameFilter: string | null;
  startDate: string | null;
  endDate: string | null;
  startHour: number | null;
  endHour: number | null;
  slotSearchType: "Standard" | "DiagnosticProcedure";
  doctorLanguageId: number | null;
  intervalMinutes: number;
  active: boolean;
  messageLanguage: "pl" | "en";
  pushoverPriority: number;
  createdAt: number;
  nextRunAt: number | null;
  lastRunAt: number | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  lastFoundCount: number | null;
}

export interface FoundSlotRow {
  slot: {
    id: number;
    monitorId: number;
    appointmentDate: string;
    doctorName: string | null;
    clinicName: string | null;
    specialtyName: string | null;
    visitType: string | null;
    firstSeenAt: number;
    notifiedAt: number | null;
    goneAt: number | null;
    goneReason: "taken" | "expired" | null;
  };
  monitorName: string | null;
}

export interface ActivityEvent {
  type: "found" | "taken" | "expired";
  at: number;
  slotId: number;
  monitorName: string | null;
  appointmentDate: string;
  doctorName: string | null;
  clinicName: string | null;
  specialtyName: string | null;
}

export interface MedicoverStatus {
  status: "disconnected" | "connected" | "action_required";
  statusDetail?: string;
  profile?: { firstName?: string; lastName?: string; mrn?: number };
  pending: { kind: "mfa_setup" | "mfa_code"; channelHint?: string } | null;
}

export const parseJsonArray = (json: string): string[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export class ApiError extends Error {
  constructor(
    message: string,
    public payload?: { error?: string; detail?: string },
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.message ?? `Request failed (${res.status})`, body);
  }
  return body as T;
}

/** Tiny polling fetcher — enough state management for a homelab dashboard. */
export function usePoll<T>(path: string | null, intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    const current = pathRef.current;
    if (!current) return;
    try {
      const result = await api<T>(current);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    if (!path) {
      setLoading(false);
      return;
    }
    void reload();
    if (intervalMs > 0) {
      const t = setInterval(() => void reload(), intervalMs);
      return () => clearInterval(t);
    }
  }, [path, intervalMs, reload]);

  return { data, error, loading, reload };
}

export function formatSlotDate(iso: string): string {
  const [date, time] = iso.split("T");
  if (!date || !time) return iso;
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y} ${time.slice(0, 5)}`;
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

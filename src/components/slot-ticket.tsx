"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Star } from "lucide-react";
import { api, formatSlotDate, type FoundSlotRow } from "@/lib/client";
import { Badge } from "@/components/ui";

interface Enrichment {
  profileUrl?: string;
  photoUrl?: string;
  rating?: number;
  reviewCount?: number;
  searchUrl: string;
}

const enrichmentCache = new Map<string, Enrichment>();

/**
 * A found slot rendered as a waiting-room ticket: perforated edge, monospace
 * time block, doctor enriched with a znanylekarz.pl photo when available.
 */
export function SlotTicket({ row }: { row: FoundSlotRow }) {
  const { slot, monitorName } = row;
  const [enrichment, setEnrichment] = useState<Enrichment | null>(
    slot.doctorName ? (enrichmentCache.get(slot.doctorName) ?? null) : null,
  );

  useEffect(() => {
    const name = slot.doctorName;
    if (!name || enrichmentCache.has(name)) return;
    let cancelled = false;
    api<Enrichment>(`/api/doctors/enrich?name=${encodeURIComponent(name)}`)
      .then((e) => {
        enrichmentCache.set(name, e);
        if (!cancelled) setEnrichment(e);
      })
      .catch(() => {
        /* enrichment is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [slot.doctorName]);

  const [datePart, timePart] = formatSlotDate(slot.appointmentDate).split(" ");
  const isNew = Date.now() - slot.firstSeenAt < 24 * 3600 * 1000;

  return (
    <div className="stamp-in flex overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {/* Perforated time stub */}
      <div className="ticket-edge relative flex w-24 shrink-0 flex-col items-center justify-center border-r border-dashed border-line bg-clinic-wash px-2 py-4">
        <span className="font-mono text-lg font-medium text-clinic-deep">{timePart}</span>
        <span className="mt-0.5 font-mono text-[11px] text-ink-soft">{datePart}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
        {enrichment?.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={enrichment.photoUrl}
            alt=""
            className="h-11 w-11 shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-paper font-display text-sm font-semibold text-ink-soft">
            {slot.doctorName
              ?.split(" ")
              .slice(-2)
              .map((p) => p[0])
              .join("") ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{slot.doctorName ?? "Any doctor"}</span>
            {enrichment?.rating ? (
              <span className="inline-flex items-center gap-0.5 font-mono text-xs text-amber">
                <Star size={12} fill="currentColor" /> {enrichment.rating.toFixed(1)}
                {enrichment.reviewCount ? ` (${enrichment.reviewCount})` : ""}
              </span>
            ) : null}
            {(enrichment?.profileUrl ?? enrichment?.searchUrl) ? (
              <a
                href={enrichment.profileUrl ?? enrichment.searchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-clinic hover:underline"
                title={enrichment.profileUrl ? "ZnanyLekarz profile" : "Search on ZnanyLekarz"}
              >
                ZnanyLekarz <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-ink-soft">
            {slot.specialtyName}
            {slot.clinicName ? ` · ${slot.clinicName}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {isNew ? <Badge tone="found">NEW</Badge> : null}
          {monitorName ? <Badge tone="neutral">{monitorName}</Badge> : null}
        </div>
      </div>
    </div>
  );
}

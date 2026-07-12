"use client";

import Link from "next/link";
import { useState } from "react";
import { Pause, Play, Plus, RefreshCw, SquarePen, Trash2 } from "lucide-react";
import clsx from "clsx";
import {
  api,
  parseJsonArray,
  timeAgo,
  usePoll,
  type MedicoverStatus,
  type Monitor,
} from "@/lib/client";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

export default function DashboardPage() {
  const monitors = usePoll<Monitor[]>("/api/monitors", 15_000);
  const status = usePoll<MedicoverStatus>("/api/medicover/status", 30_000);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const act = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setRunResult(null);
    try {
      await fn();
    } catch (err) {
      setRunResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
      void monitors.reload();
    }
  };

  const list = monitors.data ?? [];
  const active = list.filter((m) => m.active);
  const lastSweep = list.reduce<number | null>(
    (acc, m) => (m.lastRunAt && (!acc || m.lastRunAt > acc) ? m.lastRunAt : acc),
    null,
  );
  const caught = list.reduce((acc, m) => acc + (m.lastFoundCount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Monitors"
        lead="Each monitor sweeps Medicover for free slots on its own schedule and pings you when something new appears."
        action={
          <Link
            href="/monitors/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-clinic px-3.5 py-2 text-sm font-medium text-white hover:bg-clinic-deep"
          >
            <Plus size={16} /> Add monitor
          </Link>
        }
      />

      {status.data && status.data.status !== "connected" ? (
        <Card
          className={clsx(
            "mb-6 px-5 py-4",
            status.data.status === "action_required" ? "border-amber" : "border-alert",
          )}
        >
          <p className="text-sm">
            {status.data.status === "action_required" ? (
              <>
                <span className="font-semibold">Medicover needs a confirmation code.</span>{" "}
                Finish connecting in{" "}
                <Link href="/settings" className="text-clinic underline">
                  Settings
                </Link>{" "}
                — monitors are paused until then.
              </>
            ) : (
              <>
                <span className="font-semibold">Medicover account not connected.</span>{" "}
                Connect it in{" "}
                <Link href="/settings" className="text-clinic underline">
                  Settings
                </Link>{" "}
                to start sweeping for slots.
              </>
            )}
          </p>
        </Card>
      ) : null}

      {/* Departures-board status strip */}
      <div className="mb-6 rounded-xl border border-line bg-ink px-5 py-3 font-mono text-[13px] text-white/90">
        <span className="text-found">{active.length}</span> monitor
        {active.length === 1 ? "" : "s"} on duty
        <span className="mx-3 text-white/30">·</span>
        last sweep{" "}
        <span className="text-white">{lastSweep ? timeAgo(lastSweep) : "—"}</span>
        <span className="mx-3 text-white/30">·</span>
        <span className="text-white">{caught}</span> slot{caught === 1 ? "" : "s"} on the
        board
      </div>

      {runResult ? (
        <Card className="mb-4 border-alert px-4 py-3 text-sm text-alert">{runResult}</Card>
      ) : null}

      {monitors.loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="No monitors yet"
          body="Create your first monitor: pick regions and a specialty, optionally narrow to clinics or a doctor, and medibrowserr will keep watch."
          action={
            <Link
              href="/monitors/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-clinic px-3.5 py-2 text-sm font-medium text-white hover:bg-clinic-deep"
            >
              <Plus size={16} /> Add monitor
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((m) => {
            const scope = [
              parseJsonArray(m.regionNames).join(", "),
              parseJsonArray(m.specialtyNames).join(", "),
              parseJsonArray(m.clinicNames).join(", ") || "any clinic",
              parseJsonArray(m.doctorNames).join(", ") ||
                (m.doctorNameFilter ? `name ~ "${m.doctorNameFilter}"` : "any doctor"),
            ];
            return (
              <Card key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span
                    className={clsx(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      m.active ? "duty-dot bg-found" : "bg-line",
                    )}
                    title={m.active ? "On duty" : "Paused"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/monitors/${m.id}`}
                        className="font-display text-[17px] font-semibold hover:text-clinic-deep"
                      >
                        {m.name}
                      </Link>
                      <Badge tone="clinic">every {m.intervalMinutes}m</Badge>
                      <Badge tone={m.messageLanguage === "pl" ? "neutral" : "neutral"}>
                        {m.messageLanguage.toUpperCase()}
                      </Badge>
                      {m.lastStatus === "error" ? (
                        <Badge tone="alert">error</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-[13px] text-ink-soft">
                      {scope.join(" → ")}
                    </p>
                    {m.lastStatus === "error" && m.lastError ? (
                      <p className="mt-1 truncate text-xs text-alert">{m.lastError}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs text-ink-soft">
                    <span title="Last sweep">{timeAgo(m.lastRunAt)}</span>
                    <span title="Slots seen in the last sweep">
                      {m.lastFoundCount ?? "—"} found
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Run sweep now"
                      disabled={busyId === m.id}
                      onClick={() =>
                        act(m.id, async () => {
                          const r = await api<{ found: number; newCount: number }>(
                            `/api/monitors/${m.id}/run`,
                            { method: "POST" },
                          );
                          setRunResult(null);
                          void monitors.reload();
                          alert(`Sweep done: ${r.found} slots, ${r.newCount} new.`);
                        })
                      }
                    >
                      {busyId === m.id ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw size={15} />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={m.active ? "Pause" : "Resume"}
                      onClick={() =>
                        act(m.id, () =>
                          api(`/api/monitors/${m.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !m.active }),
                          }),
                        )
                      }
                    >
                      {m.active ? <Pause size={15} /> : <Play size={15} />}
                    </Button>
                    <Link
                      href={`/monitors/${m.id}`}
                      className="rounded-lg p-1.5 text-ink-soft hover:bg-paper hover:text-ink"
                      title="Edit"
                    >
                      <SquarePen size={15} />
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete monitor "${m.name}" and its history?`)) {
                          void act(m.id, () =>
                            api(`/api/monitors/${m.id}`, { method: "DELETE" }),
                          );
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

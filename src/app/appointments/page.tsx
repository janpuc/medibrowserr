"use client";

import { useState } from "react";
import clsx from "clsx";
import { formatSlotDate, usePoll, type FoundSlotRow } from "@/lib/client";
import { Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { SlotTicket } from "@/components/slot-ticket";

interface PersonAppointment {
  id: string;
  clinic?: { name?: string };
  doctor?: { name?: string };
  specialty?: { name?: string };
  date: string;
  state?: string;
}

export default function AppointmentsPage() {
  const [tab, setTab] = useState<"caught" | "mine">("caught");
  const caught = usePoll<FoundSlotRow[]>(
    tab === "caught" ? "/api/slots?limit=100" : null,
    20_000,
  );
  const mine = usePoll<PersonAppointment[]>(
    tab === "mine" ? "/api/appointments" : null,
  );

  return (
    <>
      <PageHeader
        title="Appointments"
        lead="Every slot your monitors have caught, and the visits already booked on your Medicover account."
      />

      <div className="mb-6 flex gap-2">
        {(
          [
            ["caught", "Caught slots"],
            ["mine", "My booked visits"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "primary" : "secondary"}
            onClick={() => setTab(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "caught" ? (
        caught.loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (caught.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="Nothing caught yet"
            body="When a monitor spots a free slot it lands here as a ticket — and you get the Pushover ping."
          />
        ) : (
          <div className="space-y-3">
            {caught.data!.map((row) => (
              <SlotTicket key={row.slot.id} row={row} />
            ))}
          </div>
        )
      ) : mine.loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : mine.error ? (
        <Card className="border-alert px-5 py-4 text-sm">
          <p className="font-medium text-alert">Couldn&apos;t fetch your visits</p>
          <p className="mt-0.5 text-ink-soft">{mine.error}</p>
        </Card>
      ) : (mine.data?.length ?? 0) === 0 ? (
        <EmptyState title="No planned visits" body="Your Medicover account has no upcoming appointments." />
      ) : (
        <div className="space-y-3">
          {mine.data!.map((a) => (
            <Card key={a.id} className="flex items-center gap-4 px-5 py-4">
              <span className="font-mono text-sm text-clinic-deep">
                {formatSlotDate(a.date)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.doctor?.name ?? "—"}</p>
                <p className="truncate text-[13px] text-ink-soft">
                  {a.specialty?.name}
                  {a.clinic?.name ? ` · ${a.clinic.name}` : ""}
                </p>
              </div>
              <span
                className={clsx(
                  "font-mono text-[11px]",
                  a.state === "Planned" ? "text-found" : "text-ink-soft",
                )}
              >
                {a.state}
              </span>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

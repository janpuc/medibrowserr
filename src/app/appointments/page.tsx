"use client";

import { useState } from "react";
import { CalendarPlus, CalendarX2, Clock } from "lucide-react";
import clsx from "clsx";
import {
  formatSlotDate,
  timeAgo,
  usePoll,
  type ActivityEvent,
  type FoundSlotRow,
} from "@/lib/client";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { SlotTicket } from "@/components/slot-ticket";

interface PersonAppointment {
  id: string;
  clinic?: { name?: string };
  doctor?: { name?: string };
  specialty?: { name?: string };
  date: string;
  state?: string;
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const icon =
    event.type === "found" ? (
      <CalendarPlus size={15} className="text-found" />
    ) : event.type === "taken" ? (
      <CalendarX2 size={15} className="text-alert" />
    ) : (
      <Clock size={15} className="text-ink-soft" />
    );
  const label =
    event.type === "found" ? "found" : event.type === "taken" ? "taken" : "expired";
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-b-0">
      <span className="shrink-0">{icon}</span>
      <span className="w-24 shrink-0 font-mono text-[11px] text-ink-soft" title={new Date(event.at).toLocaleString()}>
        {timeAgo(event.at)}
      </span>
      <Badge
        tone={event.type === "found" ? "found" : event.type === "taken" ? "alert" : "neutral"}
      >
        {label}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-mono text-[13px] text-clinic-deep">
          {formatSlotDate(event.appointmentDate)}
        </span>
        {" · "}
        {event.doctorName ?? "Any doctor"}
        {event.clinicName ? ` · ${event.clinicName}` : ""}
      </span>
      {event.monitorName ? (
        <span className="hidden shrink-0 sm:block">
          <Badge tone="neutral">{event.monitorName}</Badge>
        </span>
      ) : null}
    </li>
  );
}

export default function AppointmentsPage() {
  const [tab, setTab] = useState<"caught" | "activity" | "mine">("caught");
  const caught = usePoll<FoundSlotRow[]>(
    tab === "caught" ? "/api/slots?limit=100" : null,
    20_000,
  );
  const activity = usePoll<ActivityEvent[]>(
    tab === "activity" ? "/api/slots/activity?limit=200" : null,
    20_000,
  );
  const mine = usePoll<PersonAppointment[]>(tab === "mine" ? "/api/appointments" : null);

  return (
    <>
      <PageHeader
        title="Appointments"
        lead="Slots your monitors caught (and lost), the full activity log, and your booked Medicover visits."
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["caught", "Caught slots"],
            ["activity", "Activity log"],
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
            body="When a monitor spots a free slot it lands here as a ticket — and you get the Pushover ping. Taken slots stay visible, grayed out."
          />
        ) : (
          <div className="space-y-3">
            {caught.data!.map((row) => (
              <SlotTicket key={row.slot.id} row={row} />
            ))}
          </div>
        )
      ) : null}

      {tab === "activity" ? (
        activity.loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (activity.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No activity yet"
            body="Every found, taken and expired slot shows up here as it happens."
          />
        ) : (
          <Card className="p-0">
            <ul>
              {activity.data!.map((event) => (
                <ActivityRow key={`${event.slotId}-${event.type}`} event={event} />
              ))}
            </ul>
          </Card>
        )
      ) : null}

      {tab === "mine" ? (
        mine.loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : mine.error ? (
          <Card className="border-alert px-5 py-4 text-sm">
            <p className="font-medium text-alert">Couldn&apos;t fetch your visits</p>
            <p className="mt-0.5 text-ink-soft">{mine.error}</p>
          </Card>
        ) : (mine.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No planned visits"
            body="Your Medicover account has no upcoming appointments."
          />
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
        )
      ) : null}
    </>
  );
}

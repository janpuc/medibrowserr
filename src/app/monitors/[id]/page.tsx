"use client";

import { use } from "react";
import { usePoll, type Monitor } from "@/lib/client";
import { PageHeader, Spinner } from "@/components/ui";
import { MonitorForm } from "@/components/monitor-form";

export default function EditMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const monitor = usePoll<Monitor>(`/api/monitors/${id}`);

  return (
    <>
      <PageHeader title="Edit monitor" />
      {monitor.loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : monitor.data ? (
        <MonitorForm existing={monitor.data} />
      ) : (
        <p className="text-sm text-alert">Monitor not found. {monitor.error}</p>
      )}
    </>
  );
}

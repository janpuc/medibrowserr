"use client";

import { PageHeader } from "@/components/ui";
import { MonitorForm } from "@/components/monitor-form";

export default function NewMonitorPage() {
  return (
    <>
      <PageHeader
        title="Add monitor"
        lead="Choose where and what to watch. The monitor sweeps on its schedule and notifies you about every new slot it catches."
      />
      <MonitorForm />
    </>
  );
}

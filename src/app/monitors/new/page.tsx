"use client";

import { Suspense } from "react";
import { PageHeader, Spinner } from "@/components/ui";
import { MonitorForm } from "@/components/monitor-form";

export default function NewMonitorPage() {
  return (
    <>
      <PageHeader
        title="Add monitor"
        lead="Pick a specialty and go — regions, clinics and schedule come from your defaults."
      />
      {/* Suspense: MonitorForm reads the ?hint= search param. */}
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        }
      >
        <MonitorForm />
      </Suspense>
    </>
  );
}

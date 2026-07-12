"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { api, usePoll } from "@/lib/client";
import { Card, EmptyState, PageHeader, Spinner, inputClass } from "@/components/ui";

type Json = Record<string, unknown>;

interface ServiceHit {
  id?: string;
  serviceId?: string;
  name?: string;
  value?: string;
  [k: string]: unknown;
}

/** Renders unknown-but-flat API payloads as tidy label/value rows. */
function KeyValues({ data }: { data: Json }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== "object",
  );
  const nested = Object.entries(data).filter(
    ([, v]) => v !== null && typeof v === "object",
  );
  return (
    <div className="space-y-3">
      {entries.length ? (
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1">
              <dt className="text-[13px] text-ink-soft">{labelize(k)}</dt>
              <dd className="text-right text-[13px] font-medium">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {nested.map(([k, v]) => (
        <div key={k}>
          <h4 className="mb-1 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
            {labelize(k)}
          </h4>
          {Array.isArray(v) ? (
            v.length === 0 ? (
              <p className="text-[13px] text-ink-soft">—</p>
            ) : (
              <div className="space-y-2">
                {v.map((item, i) =>
                  item && typeof item === "object" ? (
                    <Card key={i} className="p-3">
                      <KeyValues data={item as Json} />
                    </Card>
                  ) : (
                    <p key={i} className="text-[13px]">
                      {formatValue(item)}
                    </p>
                  ),
                )}
              </div>
            )
          ) : (
            <Card className="p-3">
              <KeyValues data={v as Json} />
            </Card>
          )}
        </div>
      ))}
    </div>
  );
}

const labelize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const formatValue = (v: unknown): string => {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
};

export default function CoveragePage() {
  const plans = usePoll<Json[]>("/api/coverage");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ServiceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [summary, setSummary] = useState<Json | null>(null);
  const [summaryFor, setSummaryFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced service search.
  useEffect(() => {
    if (query.trim().length < 3) {
      setHits(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api<ServiceHit[]>(`/api/coverage?q=${encodeURIComponent(query.trim())}`)
        .then((r) => {
          setHits(r);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const showSummary = async (hit: ServiceHit) => {
    const id = String(hit.serviceId ?? hit.id ?? "");
    if (!id) return;
    setSummaryFor(String(hit.name ?? hit.value ?? id));
    setSummary(null);
    try {
      setSummary(await api<Json>(`/api/coverage?serviceId=${encodeURIComponent(id)}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Coverage"
        lead="What your Medicover plan includes. Search any service to see whether it's covered, limited or discounted."
      />

      <Card className="mb-6 p-5">
        <div className="relative">
          <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search a service, e.g. rezonans, kardiolog, USG…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {searching ? (
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        ) : hits ? (
          hits.length === 0 ? (
            <p className="mt-4 text-sm text-ink-soft">
              No services match &quot;{query}&quot;.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line/60">
              {hits.map((hit, i) => (
                <li key={i}>
                  <button
                    className="w-full px-1 py-2 text-left text-sm hover:text-clinic-deep"
                    onClick={() => void showSummary(hit)}
                  >
                    {String(hit.name ?? hit.value ?? JSON.stringify(hit))}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>

      {error ? (
        <Card className="mb-6 border-alert px-5 py-4 text-sm">
          <p className="font-medium text-alert">Coverage lookup failed</p>
          <p className="mt-0.5 text-ink-soft">{error}</p>
        </Card>
      ) : null}

      {summaryFor ? (
        <Card className="mb-6 p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">{summaryFor}</h2>
          {summary ? <KeyValues data={summary} /> : <Spinner />}
        </Card>
      ) : null}

      <h2 className="mb-3 font-display text-lg font-semibold">My plan</h2>
      {plans.loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : plans.error ? (
        <EmptyState
          title="Plan unavailable"
          body={`Couldn't fetch benefit plans: ${plans.error}. Make sure the Medicover account is connected in Settings.`}
        />
      ) : (plans.data?.length ?? 0) === 0 ? (
        <EmptyState title="No plan data" body="Medicover returned no benefit plans for this account." />
      ) : (
        <div className="space-y-3">
          {plans.data!.map((plan, i) => (
            <Card key={i} className="p-5">
              <KeyValues data={plan} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

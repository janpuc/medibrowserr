"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BadgePercent,
  ChevronDown,
  ChevronUp,
  DatabaseZap,
  FileWarning,
  RefreshCw,
  Search,
  Telescope,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { api, timeAgo, usePoll } from "@/lib/client";
import { ConfirmDialog } from "@/components/confirm";
import { Badge, Button, Card, PageHeader, Spinner, inputClass } from "@/components/ui";

interface Plan {
  id: string;
  name: string;
  companyName?: string;
}

interface IndexItem {
  serviceId: string;
  name: string;
  code: string | null;
  verdict: "covered" | "covered_referral" | "discount" | "fixed_price" | "payable" | null;
  referralRequired: boolean | null;
  discount: number | null;
  fixedPayment: number | null;
  volumeLimit: number | null;
  volumeUsed: number | null;
  valueLimit: number | null;
  valueUsed: number | null;
}

interface SeedStatus {
  state: "idle" | "running" | "done" | "error";
  done: number;
  total: number;
  error?: string;
  freshUntil: number | null;
}

interface IndexResponse {
  items: IndexItem[];
  page: number;
  pageSize: number;
  counts: { all: number; inplan: number; discount: number; payable: number; pending: number };
  seed: SeedStatus;
}

interface ServiceDetail extends IndexItem {
  description: string | null;
  productName: string | null;
  planName: string | null;
  remarks: string[];
  fetchedAt: number | null;
}

type Filter = "inplan" | "discount" | "payable" | "all";

function VerdictBadge({ item }: { item: Pick<IndexItem, "verdict" | "referralRequired" | "discount" | "fixedPayment"> }) {
  switch (item.verdict) {
    case "covered":
      return (
        <Badge tone="found">
          <BadgeCheck size={12} /> included
        </Badge>
      );
    case "covered_referral":
      return (
        <Badge tone="found">
          <BadgeCheck size={12} /> included*
        </Badge>
      );
    case "discount":
      return (
        <Badge tone="clinic">
          <BadgePercent size={12} /> {item.discount}% discount
        </Badge>
      );
    case "fixed_price":
      return (
        <Badge tone="amber">
          <Wallet size={12} /> {item.fixedPayment} zł
        </Badge>
      );
    case "payable":
      return <Badge tone="neutral">payable</Badge>;
    default:
      return <Badge tone="neutral">pending…</Badge>;
  }
}

function ServiceRow({ item }: { item: IndexItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ServiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || detail || error) return;
    api<ServiceDetail>(`/api/coverage/service/${encodeURIComponent(item.serviceId)}`)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [open, detail, error, item.serviceId]);

  return (
    <li className="border-b border-line/60 last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper/60"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          {item.code ? (
            <span className="font-mono text-[11px] text-ink-soft">{item.code}</span>
          ) : null}
        </span>
        {item.volumeLimit ? (
          <Badge tone="neutral">
            {item.volumeUsed ?? 0}/{item.volumeLimit} used
          </Badge>
        ) : null}
        {item.referralRequired && item.verdict === "covered" ? (
          <Badge tone="amber">
            <FileWarning size={12} /> referral
          </Badge>
        ) : null}
        <VerdictBadge item={item} />
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-ink-soft" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-ink-soft" />
        )}
      </button>
      {open ? (
        <div className="space-y-3 px-4 pb-4">
          {error ? (
            <p className="text-[13px] text-alert">{error}</p>
          ) : !detail ? (
            <Spinner />
          ) : (
            <>
              {detail.verdict === "covered_referral" ? (
                <p className="rounded-lg bg-found-wash px-3 py-2 text-[13px]">
                  *Included with a referral — see the plan&apos;s criteria below.
                </p>
              ) : null}
              {detail.remarks.length ? (
                <ul className="list-inside list-disc space-y-0.5 text-[13px] text-ink-soft">
                  {detail.remarks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : null}
              {detail.description ? (
                <p className="text-[13px] leading-relaxed text-ink-soft">{detail.description}</p>
              ) : null}
              {detail.productName ? (
                <p className="text-[12px] text-ink-soft">
                  {detail.productName}
                  {detail.planName ? ` · ${detail.planName}` : ""}
                  {detail.fetchedAt ? ` · checked ${timeAgo(detail.fetchedAt)}` : ""}
                </p>
              ) : null}
              <Button
                size="sm"
                onClick={() =>
                  router.push(`/monitors/new?hint=${encodeURIComponent(item.name)}`)
                }
              >
                <Telescope size={14} /> Create monitor for this
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function CoveragePage() {
  const plans = usePoll<Plan[]>("/api/coverage");
  const [filter, setFilter] = useState<Filter>("inplan");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<IndexResponse | null>(null);
  const [items, setItems] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seedRunning = data?.seed.state === "running";
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (page: number, append = false) => {
      const params = new URLSearchParams({ q: query.trim(), filter, page: String(page) });
      const res = await api<IndexResponse>(`/api/coverage/index?${params}`);
      setData(res);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
      return res;
    },
    [query, filter],
  );

  // Initial + on filter/search change (debounced).
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      fetchPage(1)
        .then(() => setError(null))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [fetchPage]);

  // While the seeder runs, refresh counts/progress every few seconds.
  useEffect(() => {
    if (!seedRunning) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => {
      void fetchPage(1).catch(() => {});
    }, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [seedRunning, fetchPage]);

  const startSeed = async (force: boolean) => {
    try {
      await api("/api/coverage/seed", { method: "POST", body: JSON.stringify({ force }) });
      await fetchPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const counts = data?.counts;
  const seed = data?.seed;
  const indexEmpty = (counts?.all ?? 0) === 0;
  const activeCount =
    filter === "inplan"
      ? (counts?.inplan ?? 0)
      : filter === "discount"
        ? (counts?.discount ?? 0)
        : filter === "payable"
          ? (counts?.payable ?? 0)
          : (counts?.all ?? 0);
  const hasMore = items.length < activeCount;

  // Lazy loading: fetch the next page whenever the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || loadingMore) return;
        setLoadingMore(true);
        void fetchPage((data?.page ?? 1) + 1, true)
          .catch(() => {})
          .finally(() => setLoadingMore(false));
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, data?.page, fetchPage]);

  const chips: { key: Filter; label: string; count?: number }[] = [
    { key: "inplan", label: "In my plan", count: counts?.inplan },
    { key: "discount", label: "Discounts", count: counts?.discount },
    { key: "payable", label: "Payable", count: counts?.payable },
    { key: "all", label: "All", count: counts?.all },
  ];

  return (
    <>
      <PageHeader
        title="Coverage"
        lead="Your plan's take on every Medicover service — indexed locally, so browsing is instant."
      />

      {plans.data?.length ? (
        <div className="mb-5 flex flex-wrap gap-3">
          {plans.data.map((plan) => (
            <Card key={plan.id} className="px-5 py-3">
              <p className="font-display text-[15px] font-semibold">{plan.name}</p>
              {plan.companyName ? (
                <p className="mt-0.5 text-xs text-ink-soft">via {plan.companyName}</p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}

      {/* Seed status */}
      {seedRunning && seed ? (
        <Card className="mb-5 px-5 py-4">
          <div className="flex items-center gap-3">
            <Spinner />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                Building the coverage index — {seed.done.toLocaleString()} /{" "}
                {seed.total.toLocaleString()} services
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-clinic transition-all"
                  style={{ width: `${seed.total ? Math.round((seed.done / seed.total) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">
                Runs in the background (~20 min) — results appear as they come in.
              </p>
            </div>
          </div>
        </Card>
      ) : indexEmpty ? (
        <Card className="mb-5 px-6 py-8 text-center">
          <DatabaseZap className="mx-auto text-clinic" size={28} />
          <h3 className="mt-2 font-display text-lg font-semibold">Build your coverage index</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            One background pass (~20 minutes) checks all ~9 000 Medicover services against
            your plan. It refreshes itself every 3 weeks.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            onClick={() => void startSeed(false)}
          >
            <DatabaseZap size={15} /> Build index
          </Button>
          {seed?.state === "error" ? (
            <p className="mt-3 text-[13px] text-alert">Last attempt failed: {seed.error}</p>
          ) : null}
        </Card>
      ) : (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
          {counts?.pending ? (
            <>Indexed {counts.all - counts.pending} of {counts.all} services (rest pending)</>
          ) : (
            <>Indexed {counts?.all.toLocaleString()} services</>
          )}
          {seed?.freshUntil ? <>· next refresh {timeAgo(seed.freshUntil - 21 * 24 * 3600 * 1000)}</> : null}
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmRebuild(true)}
            title="Re-checks every service against Medicover — takes about 30 minutes"
          >
            <RefreshCw size={13} /> Rebuild index (~30 min)
          </Button>
        </p>
      )}

      <ConfirmDialog
        open={confirmRebuild}
        title="Rebuild the whole coverage index?"
        body={`Every service (${(counts?.all ?? 0).toLocaleString()}) gets re-checked against Medicover. It runs in the background but takes about 30 minutes and hits their API a few times per second — the index refreshes itself every 3 weeks anyway.`}
        confirmLabel="Rebuild index"
        onCancel={() => setConfirmRebuild(false)}
        onConfirm={() => {
          setConfirmRebuild(false);
          void startSeed(true);
        }}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={clsx(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              filter === chip.key
                ? "border-clinic bg-clinic text-white"
                : "border-line bg-surface text-ink-soft hover:border-clinic hover:text-clinic-deep",
            )}
          >
            {chip.label}
            {chip.count !== undefined ? (
              <span className={clsx("ml-1.5 font-mono text-[11px]", filter === chip.key ? "text-white/70" : "")}>
                {chip.count.toLocaleString()}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <Card>
        <div className="relative border-b border-line">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input
            className={clsx(inputClass, "rounded-b-none border-0 py-3 pl-11")}
            placeholder="Filter by name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <p className="px-4 py-6 text-sm text-alert">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            {indexEmpty
              ? "The index hasn't been built yet — start it above."
              : `Nothing here${query ? ` for "${query}"` : ""}.`}
          </p>
        ) : (
          <>
            <ul>
              {items.map((item) => (
                <ServiceRow key={item.serviceId} item={item} />
              ))}
            </ul>
            {hasMore ? (
              <div ref={sentinelRef} className="flex justify-center border-t border-line p-4">
                <Spinner />
              </div>
            ) : null}
          </>
        )}
      </Card>

      <p className="mt-4 text-[12px] text-ink-soft">
        *Services marked &quot;included*&quot; are free when the plan&apos;s criteria are met —
        usually a referral from a Medicover doctor. Open the entry for the exact fine print.
      </p>
    </>
  );
}

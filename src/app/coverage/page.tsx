"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  BadgePercent,
  ChevronDown,
  ChevronUp,
  FileWarning,
  Search,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { api, usePoll } from "@/lib/client";
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, inputClass } from "@/components/ui";

interface Plan {
  id: string;
  name: string;
  companyName?: string;
}

interface Service {
  serviceId: string;
  serviceName: string;
  serviceCode?: string;
  serviceDescription?: string | null;
}

interface ProductSummary {
  referralRequired?: boolean;
  discount?: number;
  hasDiscount?: boolean;
  hasValueLimit?: boolean;
  valueLimit?: number;
  valueUsedCount?: number;
  hasVolumeLimit?: boolean;
  volumeLimit?: number;
  volumeUsedCount?: number;
  remarks?: string[];
  benefitPlanName?: string;
  isFreeAsPartOfBenefit?: boolean;
  fixedPayment?: number | null;
  product?: { productName?: string };
}

interface Summary {
  service?: Service;
  productSummaries?: ProductSummary[];
}

function CoverageVerdict({ s }: { s: ProductSummary }) {
  if (s.isFreeAsPartOfBenefit) {
    return (
      <Badge tone="found">
        <BadgeCheck size={12} /> covered by plan
      </Badge>
    );
  }
  if (s.hasDiscount && s.discount) {
    return (
      <Badge tone="clinic">
        <BadgePercent size={12} /> {s.discount}% discount
      </Badge>
    );
  }
  if (s.fixedPayment) {
    return (
      <Badge tone="amber">
        <Wallet size={12} /> fixed price {s.fixedPayment} zł
      </Badge>
    );
  }
  return <Badge tone="amber">not included — payable</Badge>;
}

function SummaryDetails({ summary }: { summary: Summary }) {
  const rows = summary.productSummaries ?? [];
  if (!rows.length) {
    return (
      <p className="text-[13px] text-ink-soft">
        Your plan has no product entry for this service — it would be paid out of pocket.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((s, i) => (
        <div key={i} className="rounded-lg bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <CoverageVerdict s={s} />
            {s.referralRequired ? (
              <Badge tone="amber">
                <FileWarning size={12} /> referral required
              </Badge>
            ) : null}
            {s.hasVolumeLimit ? (
              <Badge tone="neutral">
                limit {s.volumeUsedCount ?? 0}/{s.volumeLimit} used
              </Badge>
            ) : null}
            {s.hasValueLimit ? (
              <Badge tone="neutral">
                value limit {s.valueUsedCount ?? 0}/{s.valueLimit} zł
              </Badge>
            ) : null}
          </div>
          {s.product?.productName ? (
            <p className="mt-2 text-[13px] text-ink-soft">
              {s.product.productName}
              {s.benefitPlanName ? ` · ${s.benefitPlanName}` : ""}
            </p>
          ) : null}
          {s.remarks?.length ? (
            <ul className="mt-1.5 list-inside list-disc text-[13px] text-ink-soft">
              {s.remarks.map((r, j) => (
                <li key={j}>{r}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {summary.service?.serviceDescription ? (
        <p className="text-[13px] leading-relaxed text-ink-soft">
          {summary.service.serviceDescription}
        </p>
      ) : null}
    </div>
  );
}

function ServiceRow({ service }: { service: Service }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || summary || error) return;
    api<Summary>(`/api/coverage?serviceId=${encodeURIComponent(service.serviceId)}`)
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [open, summary, error, service.serviceId]);

  return (
    <li className="border-b border-line/60 last:border-b-0">
      <button
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper/60"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{service.serviceName}</span>
          {service.serviceCode ? (
            <span className="font-mono text-[11px] text-ink-soft">{service.serviceCode}</span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-ink-soft" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-ink-soft" />
        )}
      </button>
      {open ? (
        <div className="px-4 pb-4">
          {error ? (
            <p className="text-[13px] text-alert">{error}</p>
          ) : summary ? (
            <SummaryDetails summary={summary} />
          ) : (
            <Spinner />
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function CoveragePage() {
  const plans = usePoll<Plan[]>("/api/coverage");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Service[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounced catalog fetch; empty query browses everything A→Z.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api<{ items: Service[]; hasMore: boolean }>(
        `/api/coverage?q=${encodeURIComponent(query.trim())}&page=1`,
      )
        .then((r) => {
          setItems(r.items);
          setHasMore(r.hasMore);
          setPage(1);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = async () => {
    const next = page + 1;
    try {
      const r = await api<{ items: Service[]; hasMore: boolean }>(
        `/api/coverage?q=${encodeURIComponent(query.trim())}&page=${next}`,
      );
      setItems((prev) => [...prev, ...r.items]);
      setHasMore(r.hasMore);
      setPage(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Coverage"
        lead="Everything Medicover offers, checked against your plan — covered, limited, discounted or payable."
      />

      {plans.data?.length ? (
        <div className="mb-6 flex flex-wrap gap-3">
          {plans.data.map((plan) => (
            <Card key={plan.id} className="px-5 py-3">
              <p className="font-display text-[15px] font-semibold">{plan.name}</p>
              {plan.companyName ? (
                <p className="mt-0.5 text-xs text-ink-soft">via {plan.companyName}</p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : plans.error ? (
        <Card className="mb-6 border-alert px-5 py-4 text-sm">
          <p className="font-medium text-alert">Couldn&apos;t fetch your plan</p>
          <p className="mt-0.5 text-ink-soft">
            {plans.error} — make sure the Medicover account is connected in Settings.
          </p>
        </Card>
      ) : null}

      <Card>
        <div className="relative border-b border-line">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-soft" />
          <input
            className={clsx(inputClass, "rounded-b-none border-0 py-3 pl-11")}
            placeholder="Search services — kardiolog, rezonans, USG… (empty = browse all)"
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
            No services match &quot;{query}&quot;.
          </p>
        ) : (
          <>
            <ul>
              {items.map((service) => (
                <ServiceRow key={`${service.serviceId}-${service.serviceCode}`} service={service} />
              ))}
            </ul>
            {hasMore ? (
              <div className="border-t border-line p-3 text-center">
                <Button variant="ghost" onClick={() => void loadMore()}>
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}

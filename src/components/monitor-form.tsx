"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Telescope } from "lucide-react";
import { api, formatSlotDate, type Monitor } from "@/lib/client";
import { matchSpecialty } from "@/lib/fuzzy";
import { Button, Card, Field, inputClass, Spinner } from "@/components/ui";
import { MultiSelect, type Option } from "@/components/multi-select";

interface Filters {
  regions: Option[];
  specialties: Option[];
  clinics: Option[];
  doctors: Option[];
}

interface SettingsPayload {
  settings: {
    defaultLanguage: "pl" | "en";
    defaultIntervalMinutes: number;
    defaultRegions: Option[];
    defaultClinics: Option[];
  };
}

const DOCTOR_LANGUAGES: Option[] = [
  { id: "4", value: "Polish" },
  { id: "6", value: "English" },
  { id: "60", value: "Ukrainian" },
];

/**
 * Create/edit form. Opinionated: specialty first, everything else optional
 * with defaults from Settings; rarely-used knobs live under "More options".
 */
export function MonitorForm({ existing }: { existing?: Monitor }) {
  const router = useRouter();
  // "?hint=Konsultacja kardiologa" — arriving from the coverage page.
  const hint = useSearchParams().get("hint");
  const hintState = useRef<{ resolved: boolean; flipped: boolean }>({
    resolved: false,
    flipped: false,
  });
  const toOptions = (ids: string, values: string) => {
    const idArr = JSON.parse(ids) as (string | number)[];
    const valArr = JSON.parse(values) as string[];
    return idArr.map((id, i) => ({
      id: String(id).trim(),
      value: valArr[i] ?? String(id),
    }));
  };

  const [name, setName] = useState(existing?.name ?? "");
  const [specialties, setSpecialties] = useState<Option[]>(
    existing ? toOptions(existing.specialtyIds, existing.specialtyNames) : [],
  );
  const [regions, setRegions] = useState<Option[]>(
    existing ? toOptions(existing.regionIds, existing.regionNames) : [],
  );
  const [clinics, setClinics] = useState<Option[]>(
    existing ? toOptions(existing.clinicIds, existing.clinicNames) : [],
  );
  const [doctors, setDoctors] = useState<Option[]>(
    existing ? toOptions(existing.doctorIds, existing.doctorNames) : [],
  );
  const [doctorNameFilter, setDoctorNameFilter] = useState(existing?.doctorNameFilter ?? "");
  const [searchType, setSearchType] = useState<"Standard" | "DiagnosticProcedure">(
    existing?.slotSearchType ?? "Standard",
  );
  const [language, setLanguage] = useState<Option[]>(
    existing?.doctorLanguageId
      ? DOCTOR_LANGUAGES.filter((l) => l.id === String(existing.doctorLanguageId))
      : [],
  );
  const [startDate, setStartDate] = useState(existing?.startDate ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate ?? "");
  const [startHour, setStartHour] = useState(existing?.startHour?.toString() ?? "");
  const [endHour, setEndHour] = useState(existing?.endHour?.toString() ?? "");
  const [interval, setIntervalMin] = useState(existing?.intervalMinutes ?? 15);
  const [messageLanguage, setMessageLanguage] = useState<"pl" | "en">(
    existing?.messageLanguage ?? "pl",
  );
  const [priority, setPriority] = useState(existing?.pushoverPriority ?? 0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [filters, setFilters] = useState<Filters | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    count: number;
    sample: { appointmentDate: string; doctorName: string | null; clinicName: string | null }[];
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // New monitors start from the defaults configured in Settings.
  useEffect(() => {
    if (existing) return;
    const normalize = (list: Option[]) =>
      list.map((o) => ({ id: String(o.id).trim(), value: String(o.value) }));
    void api<SettingsPayload>("/api/settings").then(({ settings }) => {
      setRegions((prev) => (prev.length ? prev : normalize(settings.defaultRegions)));
      setClinics((prev) => (prev.length ? prev : normalize(settings.defaultClinics)));
      setIntervalMin(settings.defaultIntervalMinutes);
      setMessageLanguage(settings.defaultLanguage);
    });
  }, [existing]);

  const regionIds = useMemo(() => regions.map((r) => r.id).join(","), [regions]);
  const specialtyIds = useMemo(() => specialties.map((s) => s.id).join(","), [specialties]);

  // Reload dictionaries whenever the scope above them changes.
  useEffect(() => {
    let cancelled = false;
    setFiltersLoading(true);
    setFiltersError(null);
    const params = new URLSearchParams({ type: searchType });
    if (regionIds) params.set("regionIds", regionIds);
    if (specialtyIds) params.set("specialtyIds", specialtyIds);
    api<Filters>(`/api/medicover/filters?${params}`)
      .then((f) => {
        if (cancelled) return;
        setFilters(f);
        // Resolve id-only defaults (e.g. seeded from env vars) to names.
        const resolve = (sel: Option[], dict: Option[]) =>
          sel.map((s) =>
            s.value === s.id
              ? (dict.find((d) => String(d.id).trim() === String(s.id).trim()) ?? s)
              : s,
          );
        setRegions((prev) => resolve(prev, f.regions));
        setClinics((prev) => resolve(prev, f.clinics));
        // Coverage → monitor handoff: preselect the best-matching specialty.
        if (hint && !existing && !hintState.current.resolved) {
          const match = matchSpecialty(hint, f.specialties);
          if (match) {
            hintState.current.resolved = true;
            setSpecialties((prev) => (prev.length ? prev : [match]));
            setName((prev) => prev || hint);
          } else if (!hintState.current.flipped) {
            // Many coverage entries are diagnostics — try that dictionary once.
            hintState.current.flipped = true;
            setSearchType((prev) =>
              prev === "Standard" ? "DiagnosticProcedure" : "Standard",
            );
          } else {
            // No match anywhere: keep the name, let the user pick manually.
            hintState.current.resolved = true;
            setSearchType("Standard");
            setName((prev) => prev || hint);
          }
        }
      })
      .catch((err) => {
        if (!cancelled)
          setFiltersError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setFiltersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionIds, specialtyIds, searchType]);

  const payload = () => ({
    name:
      name.trim() ||
      [specialties[0]?.value, regions.map((r) => r.value).join("/")]
        .filter(Boolean)
        .join(" – "),
    regionIds: regions.map((r) => Number(r.id)),
    regionNames: regions.map((r) => r.value),
    specialtyIds: specialties.map((s) => Number(s.id)),
    specialtyNames: specialties.map((s) => s.value),
    clinicIds: clinics.map((c) => Number(c.id)),
    clinicNames: clinics.map((c) => c.value),
    doctorIds: doctors.map((d) => Number(d.id)),
    doctorNames: doctors.map((d) => d.value),
    doctorNameFilter: doctorNameFilter.trim() || null,
    startDate: startDate || null,
    endDate: endDate || null,
    startHour: startHour === "" ? null : Number(startHour),
    endHour: endHour === "" ? null : Number(endHour),
    slotSearchType: searchType,
    doctorLanguageId: language.length ? Number(language[0].id) : null,
    intervalMinutes: interval,
    messageLanguage,
    pushoverPriority: priority,
    active: existing?.active ?? true,
  });

  const validate = () => {
    if (!specialties.length) return "Pick a specialty — that's the one required field.";
    if (!regions.length) return "Pick at least one region.";
    return null;
  };

  const runPreview = async () => {
    const invalid = validate();
    if (invalid) return setError(invalid);
    setError(null);
    setPreviewBusy(true);
    setPreview(null);
    try {
      const p = payload();
      setPreview(
        await api("/api/slots/preview", {
          method: "POST",
          body: JSON.stringify({
            regionIds: p.regionIds,
            specialtyIds: p.specialtyIds,
            clinicIds: p.clinicIds,
            doctorIds: p.doctorIds,
            doctorNameFilter: p.doctorNameFilter,
            doctorLanguageId: p.doctorLanguageId,
            startDate: p.startDate,
            endDate: p.endDate,
            startHour: p.startHour,
            endHour: p.endHour,
            slotSearchType: p.slotSearchType,
          }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  };

  const submit = async () => {
    const invalid = validate();
    if (invalid) return setError(invalid);
    setError(null);
    setSaving(true);
    try {
      if (existing) {
        await api(`/api/monitors/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload()),
        });
      } else {
        await api("/api/monitors", { method: "POST", body: JSON.stringify(payload()) });
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {filtersError ? (
        <Card className="border-alert px-4 py-3 text-sm">
          <p className="font-medium text-alert">Couldn&apos;t load Medicover dictionaries</p>
          <p className="mt-0.5 text-ink-soft">
            {filtersError} — connect the account in Settings, then come back here.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Specialty" hint="The one thing you must pick.">
            <MultiSelect
              options={filters?.specialties ?? []}
              selected={specialties}
              onChange={(next) => {
                setSpecialties(next);
                setDoctors([]);
                setPreview(null);
              }}
              placeholder="e.g. Kardiolog"
              loading={filtersLoading}
            />
          </Field>
          <Field label="Regions" hint="Prefilled from Settings; adjust freely.">
            <MultiSelect
              options={filters?.regions ?? []}
              selected={regions}
              onChange={(next) => {
                setRegions(next);
                setClinics([]);
                setDoctors([]);
                setPreview(null);
              }}
              placeholder="Pick regions"
              loading={filtersLoading}
            />
          </Field>
          <Field label="Clinics" hint="Empty = every clinic in the region.">
            <MultiSelect
              options={filters?.clinics ?? []}
              selected={clinics}
              onChange={setClinics}
              placeholder="Any clinic"
              disabled={!regions.length || !specialties.length}
              loading={filtersLoading}
            />
          </Field>
          <Field label="Doctor" hint="Pick from the list and/or match by name.">
            <div className="space-y-2">
              <MultiSelect
                options={filters?.doctors ?? []}
                selected={doctors}
                onChange={setDoctors}
                placeholder="Any doctor"
                disabled={!regions.length || !specialties.length}
                loading={filtersLoading}
              />
              <input
                className={inputClass}
                value={doctorNameFilter}
                onChange={(e) => setDoctorNameFilter(e.target.value)}
                placeholder='…or name contains, e.g. "Kowalska"'
              />
            </div>
          </Field>
        </div>

        <Field label="Monitor name (optional)" hint="Used as the notification title; auto-named from your picks when left empty.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              specialties.length
                ? `${specialties[0].value}${regions.length ? ` – ${regions[0].value}` : ""}`
                : "e.g. Kardiolog – Kraków"
            }
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check every">
            <div className="flex gap-2">
              {[15, 30, 60].map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={interval === m ? "primary" : "secondary"}
                  onClick={() => setIntervalMin(m)}
                >
                  {m} min
                </Button>
              ))}
              <input
                type="number"
                min={5}
                max={1440}
                className={`${inputClass} w-24`}
                value={interval}
                onChange={(e) => setIntervalMin(Number(e.target.value) || 15)}
                aria-label="Custom interval in minutes"
              />
            </div>
          </Field>
          <Field label="Notification language" hint="Wording of the Pushover message.">
            <div className="flex gap-2">
              {(
                [
                  ["pl", "Polski"],
                  ["en", "English"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={messageLanguage === value ? "primary" : "secondary"}
                  onClick={() => setMessageLanguage(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </Card>

      <Card className="p-0">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-ink-soft hover:text-ink"
          onClick={() => setShowAdvanced((s) => !s)}
          aria-expanded={showAdvanced}
        >
          More options — dates, hours, visit type, priority
          <ChevronDown
            size={16}
            className={showAdvanced ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </button>
        {showAdvanced ? (
          <div className="space-y-4 border-t border-line p-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="From date" hint="Empty = today.">
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Until date">
                <input
                  type="date"
                  className={inputClass}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
              <Field label="Earliest hour" hint="0–23">
                <input
                  type="number"
                  min={0}
                  max={23}
                  className={inputClass}
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  placeholder="any"
                />
              </Field>
              <Field label="Latest hour" hint="1–24">
                <input
                  type="number"
                  min={1}
                  max={24}
                  className={inputClass}
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  placeholder="any"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Visit type">
                <div className="flex gap-2">
                  {(
                    [
                      ["Standard", "Consultation"],
                      ["DiagnosticProcedure", "Diagnostic"],
                    ] as const
                  ).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={searchType === value ? "primary" : "secondary"}
                      onClick={() => setSearchType(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label="Doctor speaks">
                <MultiSelect
                  options={DOCTOR_LANGUAGES}
                  selected={language}
                  onChange={setLanguage}
                  placeholder="Any language"
                  single
                />
              </Field>
              <Field label="Pushover priority" hint="High bypasses quiet hours; emergency repeats until acknowledged.">
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                >
                  <option value={-2}>Lowest (no alert)</option>
                  <option value={-1}>Low (quiet)</option>
                  <option value={0}>Normal</option>
                  <option value={1}>High</option>
                  <option value={2}>Emergency</option>
                </select>
              </Field>
            </div>
          </div>
        ) : null}
      </Card>

      {preview ? (
        <Card className="p-5">
          <p className="text-sm font-medium">
            Right now this search finds{" "}
            <span className={preview.count ? "text-found" : "text-amber"}>
              {preview.count} slot{preview.count === 1 ? "" : "s"}
            </span>
            .
          </p>
          {preview.sample.length ? (
            <ul className="mt-2 space-y-1 font-mono text-[13px] text-ink-soft">
              {preview.sample.map((s, i) => (
                <li key={i}>
                  {formatSlotDate(s.appointmentDate)} · {s.doctorName} · {s.clinicName}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {error ? (
        <Card className="border-alert px-4 py-3 text-sm text-alert">{error}</Card>
      ) : null}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void submit()} disabled={saving}>
          {saving ? <Spinner className="border-white/40 border-t-white" /> : null}
          {existing ? "Save changes" : "Create monitor"}
        </Button>
        <Button onClick={() => void runPreview()} disabled={previewBusy}>
          {previewBusy ? <Spinner /> : <Telescope size={15} />}
          Preview results
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

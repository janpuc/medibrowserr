"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, parseJsonArray, type Monitor } from "@/lib/client";
import { Button, Card, Field, inputClass, Spinner } from "@/components/ui";
import { MultiSelect, type Option } from "@/components/multi-select";

interface Filters {
  regions: Option[];
  specialties: Option[];
  clinics: Option[];
  doctors: Option[];
}

const DOCTOR_LANGUAGES: Option[] = [
  { id: "4", value: "Polish" },
  { id: "6", value: "English" },
  { id: "60", value: "Ukrainian" },
];

/** Shared create/edit form. Dictionaries cascade: regions → specialties → clinics/doctors. */
export function MonitorForm({ existing }: { existing?: Monitor }) {
  const router = useRouter();
  const [name, setName] = useState(existing?.name ?? "");
  const [searchType, setSearchType] = useState<"Standard" | "DiagnosticProcedure">(
    existing?.slotSearchType ?? "Standard",
  );
  const toOptions = (ids: string, values: string) => {
    const idArr = parseJsonArray(ids);
    const valArr = parseJsonArray(values);
    return idArr.map((id, i) => ({ id, value: valArr[i] ?? id }));
  };
  const [regions, setRegions] = useState<Option[]>(
    existing ? toOptions(existing.regionIds, existing.regionNames) : [],
  );
  const [specialties, setSpecialties] = useState<Option[]>(
    existing ? toOptions(existing.specialtyIds, existing.specialtyNames) : [],
  );
  const [clinics, setClinics] = useState<Option[]>(
    existing ? toOptions(existing.clinicIds, existing.clinicNames) : [],
  );
  const [doctors, setDoctors] = useState<Option[]>(
    existing ? toOptions(existing.doctorIds, existing.doctorNames) : [],
  );
  const [doctorNameFilter, setDoctorNameFilter] = useState(existing?.doctorNameFilter ?? "");
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

  const [filters, setFilters] = useState<Filters | null>(null);
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        if (!cancelled) setFilters(f);
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

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Give the monitor a name.");
    if (!regions.length) return setError("Pick at least one region.");
    if (!specialties.length) return setError("Pick at least one specialty.");
    setSaving(true);
    const payload = {
      name: name.trim(),
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
    };
    try {
      if (existing) {
        await api(`/api/monitors/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/monitors", { method: "POST", body: JSON.stringify(payload) });
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
        <Field label="Monitor name" hint="Used as the notification title.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kardiolog Warszawa"
          />
        </Field>

        <Field label="Search type">
          <div className="flex gap-2">
            {(
              [
                ["Standard", "Consultation"],
                ["DiagnosticProcedure", "Diagnostic procedure"],
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Regions" hint="One or more cities/areas to search.">
            <MultiSelect
              options={filters?.regions ?? []}
              selected={regions}
              onChange={(next) => {
                setRegions(next);
                setClinics([]);
                setDoctors([]);
              }}
              placeholder="Pick regions"
              loading={filtersLoading}
            />
          </Field>
          <Field label="Specialties" hint="What kind of visit you need.">
            <MultiSelect
              options={filters?.specialties ?? []}
              selected={specialties}
              onChange={(next) => {
                setSpecialties(next);
                setClinics([]);
                setDoctors([]);
              }}
              placeholder="Pick specialties"
              loading={filtersLoading}
            />
          </Field>
          <Field label="Clinics" hint="Leave empty to search every clinic in the region.">
            <MultiSelect
              options={filters?.clinics ?? []}
              selected={clinics}
              onChange={setClinics}
              placeholder="Any clinic"
              disabled={!regions.length || !specialties.length}
              loading={filtersLoading}
            />
          </Field>
          <Field label="Doctors" hint="Search the list by name, or use the filter below.">
            <MultiSelect
              options={filters?.doctors ?? []}
              selected={doctors}
              onChange={setDoctors}
              placeholder="Any doctor"
              disabled={!regions.length || !specialties.length}
              loading={filtersLoading}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Doctor name contains"
            hint="Free-text fallback — also catches doctors missing from the list."
          >
            <input
              className={inputClass}
              value={doctorNameFilter}
              onChange={(e) => setDoctorNameFilter(e.target.value)}
              placeholder="e.g. Kowalska"
            />
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
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-semibold">Time window</h2>
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
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-semibold">Schedule &amp; notification</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sweep every (minutes)" hint="15 min is a polite default.">
            <input
              type="number"
              min={5}
              max={1440}
              className={inputClass}
              value={interval}
              onChange={(e) => setIntervalMin(Number(e.target.value) || 15)}
            />
          </Field>
          <Field label="Message language" hint="Default Pushover message wording.">
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
      </Card>

      {error ? (
        <Card className="border-alert px-4 py-3 text-sm text-alert">{error}</Card>
      ) : null}

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={() => void submit()} disabled={saving}>
          {saving ? <Spinner className="border-white/40 border-t-white" /> : null}
          {existing ? "Save changes" : "Create monitor"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

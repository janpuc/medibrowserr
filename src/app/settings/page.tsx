"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { GithubMark } from "@/components/nav";
import { api, usePoll, type MedicoverStatus } from "@/lib/client";
import { Button, Card, Field, PageHeader, Spinner, inputClass } from "@/components/ui";
import { ConnectWizard } from "@/components/connect-wizard";
import { MultiSelect, type Option } from "@/components/multi-select";

interface Settings {
  medicoverUser: string;
  medicoverPass: string;
  pushoverToken: string;
  pushoverUser: string;
  pushoverDevice: string;
  defaultLanguage: "pl" | "en";
  defaultIntervalMinutes: number;
  defaultRegions: Option[];
  defaultClinics: Option[];
  appUrl: string;
  userAgent: string;
}

interface SettingsPayload {
  settings: Settings;
  locked: (keyof Settings)[];
}

interface Filters {
  regions: Option[];
  clinics: Option[];
}

/**
 * Clinics in the dictionary are scoped to region+specialty. Internista (9)
 * is offered at practically every center, so it doubles as a "list the
 * clinics of this region" seed for the defaults picker.
 */
const CLINIC_SEED_SPECIALTY = "9";

export default function SettingsPage() {
  const status = usePoll<MedicoverStatus>("/api/medicover/status", 15_000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [locked, setLocked] = useState<(keyof Settings)[]>([]);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [dicts, setDicts] = useState<Filters | null>(null);
  const [dictsLoading, setDictsLoading] = useState(false);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void api<SettingsPayload>("/api/settings")
      .then((p) => {
        setSettings(p.settings);
        setLocked(p.locked);
      })
      .catch(() => setSettings(null));
    void api<{ version: string }>("/api/health")
      .then((h) => setVersion(h.version))
      .catch(() => setVersion(null));
  }, []);

  const regionIds = useMemo(
    () => settings?.defaultRegions.map((r) => r.id).join(",") ?? "",
    [settings?.defaultRegions],
  );

  // Region/clinic dictionaries for the defaults pickers (needs a connection).
  useEffect(() => {
    if (status.data?.status !== "connected") return;
    let cancelled = false;
    setDictsLoading(true);
    const params = new URLSearchParams({ type: "Standard" });
    if (regionIds) {
      params.set("regionIds", regionIds);
      params.set("specialtyIds", CLINIC_SEED_SPECIALTY);
    }
    api<Filters>(`/api/medicover/filters?${params}`)
      .then((f) => {
        if (cancelled) return;
        setDicts(f);
        // Resolve id-only values (seeded via env vars) to display names.
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                defaultRegions: prev.defaultRegions.map((r) =>
                  r.value === r.id
                    ? (f.regions.find((d) => String(d.id).trim() === String(r.id).trim()) ?? r)
                    : r,
                ),
                defaultClinics: prev.defaultClinics.map((c) =>
                  c.value === c.id
                    ? (f.clinics.find((d) => String(d.id).trim() === String(c.id).trim()) ?? c)
                    : c,
                ),
              }
            : prev,
        );
      })
      .catch(() => {
        /* pickers just stay empty */
      })
      .finally(() => {
        if (!cancelled) setDictsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status.data?.status, regionIds]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setFlash(null);
    try {
      const saved = await api<SettingsPayload>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved.settings);
      setLocked(saved.locked);
      setFlash("Settings saved.");
    } catch (err) {
      setFlash(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const testPushover = async () => {
    setTestBusy(true);
    setFlash(null);
    try {
      await api("/api/notify/test", {
        method: "POST",
        body: JSON.stringify({ language: settings?.defaultLanguage ?? "pl" }),
      });
      setFlash("Test notification sent — check your phone.");
    } catch (err) {
      setFlash(
        `Test failed: ${(err as { payload?: { message?: string } }).payload?.message ?? (err instanceof Error ? err.message : err)}`,
      );
    } finally {
      setTestBusy(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings({ ...settings, [key]: value });
  const isLocked = (key: keyof Settings) => locked.includes(key);

  /**
   * Text input that grays out when the value is pinned by an env var.
   * Deliberately a render *function*, not a nested component: a component
   * type recreated on each keystroke would remount the input, dropping
   * focus and reversing typed text.
   */
  const lockableInput = (
    field: keyof Settings &
      ("medicoverUser" | "medicoverPass" | "pushoverToken" | "pushoverUser" | "pushoverDevice" | "appUrl" | "userAgent"),
    type = "text",
    placeholder?: string,
  ) => (
    <div className="relative">
      <input
        className={`${inputClass} ${isLocked(field) ? "cursor-not-allowed bg-paper text-ink-soft" : ""}`}
        type={type}
        value={settings[field]}
        placeholder={placeholder}
        disabled={isLocked(field)}
        onChange={(e) => set(field, e.target.value)}
      />
      {isLocked(field) ? (
        <Lock size={13} className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-soft" />
      ) : null}
    </div>
  );

  const envHint = (key: keyof Settings, envVar: string) =>
    isLocked(key) ? `Set via ${envVar} — remove the env var to edit here.` : undefined;

  return (
    <>
      <PageHeader
        title="Settings"
        lead="Credentials stay in your own SQLite database on your own cluster. Fields with a lock come from env vars."
      />

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Medicover</h2>
          <Card className="mb-3 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Card number / login"
                hint={envHint("medicoverUser", "MEDICOVER_USER")}
              >
                {lockableInput("medicoverUser", "text", "e.g. 4612027")}
              </Field>
              <Field
                label="Password"
                hint={
                  envHint("medicoverPass", "MEDICOVER_PASS") ??
                  "Shown as ••• once saved; type to replace."
                }
              >
                {lockableInput("medicoverPass", "password")}
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Browser identity (User-Agent)"
                  hint={
                    envHint("userAgent", "MEDIBROWSERR_USER_AGENT") ??
                    "Sent with every Medicover request. Leave empty for the built-in one; change it only if requests start getting blocked."
                  }
                >
                  {lockableInput("userAgent", "text", "built-in Chrome UA")}
                </Field>
              </div>
            </div>
          </Card>
          <ConnectWizard status={status.data} onChanged={() => void status.reload()} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Pushover</h2>
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Application token"
                hint={
                  envHint("pushoverToken", "PUSHOVER_TOKEN") ??
                  "Create an app at pushover.net/apps."
                }
              >
                {lockableInput("pushoverToken", "password")}
              </Field>
              <Field label="User key" hint={envHint("pushoverUser", "PUSHOVER_USER")}>
                {lockableInput("pushoverUser")}
              </Field>
              <Field
                label="Device (optional)"
                hint={envHint("pushoverDevice", "PUSHOVER_DEVICE") ?? "Empty = all devices."}
              >
                {lockableInput("pushoverDevice")}
              </Field>
            </div>
            <Field
              label="This app's URL"
              hint={
                envHint("appUrl", "MEDIBROWSERR_URL") ??
                "Notification links open the app here, e.g. https://medibrowserr.home.lan. Empty = link to Medicover instead."
              }
            >
              {lockableInput("appUrl", "text", "https://medibrowserr.example.com")}
            </Field>
            <Button onClick={() => void testPushover()} disabled={testBusy}>
              {testBusy ? <Spinner /> : null}
              Send test notification
            </Button>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Search defaults</h2>
          <p className="mb-3 max-w-xl text-sm text-ink-soft">
            Preselected in every new monitor — set your city and usual clinics once,
            then creating a monitor is just picking a specialty.
          </p>
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="My regions"
                hint={envHint("defaultRegions", "MEDIBROWSERR_DEFAULT_REGION_IDS")}
              >
                <MultiSelect
                  options={dicts?.regions ?? []}
                  selected={settings.defaultRegions}
                  onChange={(next) => set("defaultRegions", next)}
                  placeholder={
                    status.data?.status === "connected"
                      ? "Pick regions"
                      : "Connect Medicover to load regions"
                  }
                  disabled={isLocked("defaultRegions") || status.data?.status !== "connected"}
                  loading={dictsLoading}
                />
              </Field>
              <Field
                label="My clinics"
                hint={
                  envHint("defaultClinics", "MEDIBROWSERR_DEFAULT_CLINIC_IDS") ??
                  "Optional — narrows new monitors to these centers."
                }
              >
                <MultiSelect
                  options={dicts?.clinics ?? []}
                  selected={settings.defaultClinics}
                  onChange={(next) => set("defaultClinics", next)}
                  placeholder={
                    settings.defaultRegions.length ? "Any clinic" : "Pick regions first"
                  }
                  disabled={
                    isLocked("defaultClinics") ||
                    !settings.defaultRegions.length ||
                    status.data?.status !== "connected"
                  }
                  loading={dictsLoading}
                />
              </Field>
              <Field
                label="Notification language"
                hint={envHint("defaultLanguage", "MEDIBROWSERR_DEFAULT_LANGUAGE")}
              >
                <select
                  className={inputClass}
                  value={settings.defaultLanguage}
                  disabled={isLocked("defaultLanguage")}
                  onChange={(e) => set("defaultLanguage", e.target.value as "pl" | "en")}
                >
                  <option value="pl">Polski</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field
                label="Check interval (minutes)"
                hint={envHint("defaultIntervalMinutes", "MEDIBROWSERR_DEFAULT_INTERVAL")}
              >
                <input
                  className={inputClass}
                  type="number"
                  min={5}
                  max={1440}
                  value={settings.defaultIntervalMinutes}
                  disabled={isLocked("defaultIntervalMinutes")}
                  onChange={(e) =>
                    set("defaultIntervalMinutes", Number(e.target.value) || 15)
                  }
                />
              </Field>
            </div>
          </Card>
        </section>

        {flash ? (
          <Card className="px-4 py-3 text-sm">
            <p>{flash}</p>
          </Card>
        ) : null}

        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? <Spinner className="border-white/40 border-t-white" /> : null}
          Save changes
        </Button>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">About</h2>
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
            <span>
              medibrowserr{" "}
              <span className="font-mono text-[12px] text-ink-soft">{version ?? "…"}</span>
            </span>
            <a
              href="https://github.com/janpuc/medibrowserr"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-clinic hover:underline"
            >
              <GithubMark size={15} /> github.com/janpuc/medibrowserr
            </a>
            <span className="text-ink-soft">
              GPL-3.0 · unofficial, not affiliated with Medicover
            </span>
          </Card>
        </section>
      </div>
    </>
  );
}

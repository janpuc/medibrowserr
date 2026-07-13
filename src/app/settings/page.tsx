"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Lock, Plus, Send, Upload } from "lucide-react";
import { api, usePoll, type MedicoverStatus } from "@/lib/client";
import { Button, Card, Field, PageHeader, Spinner, inputClass } from "@/components/ui";
import { ConnectWizard } from "@/components/connect-wizard";
import { GithubMark } from "@/components/nav";
import { MultiSelect, type Option } from "@/components/multi-select";

interface Settings {
  medicoverUser: string;
  medicoverPass: string;
  pushoverToken: string;
  pushoverUser: string;
  pushoverDevice: string;
  telegramBotToken: string;
  telegramChatId: string;
  gotifyUrl: string;
  gotifyToken: string;
  ntfyUrl: string;
  ntfyTopic: string;
  ntfyToken: string;
  quietHoursEnabled: boolean;
  quietHours: string;
  defaultLanguage: "pl" | "en";
  defaultIntervalMinutes: number;
  defaultRegions: Option[];
  defaultClinics: Option[];
  appUrl: string;
  userAgent: string;
}

type TextField =
  | "medicoverUser"
  | "medicoverPass"
  | "pushoverToken"
  | "pushoverUser"
  | "pushoverDevice"
  | "telegramBotToken"
  | "telegramChatId"
  | "gotifyUrl"
  | "gotifyToken"
  | "ntfyUrl"
  | "ntfyTopic"
  | "ntfyToken"
  | "quietHours"
  | "appUrl"
  | "userAgent";

interface SettingsPayload {
  settings: Settings;
  locked: (keyof Settings)[];
  uaDefault: string;
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

type ChannelKey = "pushover" | "telegram" | "gotify" | "ntfy";

interface ChannelField {
  field: TextField;
  label: string;
  env: string;
  hint?: string;
  type?: string;
  placeholder?: string;
}

/** Concise in-app hints; the README carries the full setup guides. */
const CHANNELS: { key: ChannelKey; title: string; grid: string; fields: ChannelField[] }[] = [
  {
    key: "pushover",
    title: "Pushover",
    grid: "sm:grid-cols-3",
    fields: [
      { field: "pushoverToken", label: "App API token", env: "PUSHOVER_TOKEN", hint: "From pushover.net/apps.", type: "password" },
      { field: "pushoverUser", label: "User key", env: "PUSHOVER_USER", hint: "From your dashboard." },
      { field: "pushoverDevice", label: "Device", env: "PUSHOVER_DEVICE", hint: "Empty = all." },
    ],
  },
  {
    key: "telegram",
    title: "Telegram",
    grid: "sm:grid-cols-2",
    fields: [
      { field: "telegramBotToken", label: "Bot token", env: "TELEGRAM_BOT_TOKEN", hint: "From @BotFather.", type: "password" },
      { field: "telegramChatId", label: "Chat id", env: "TELEGRAM_CHAT_ID", placeholder: "123456789" },
    ],
  },
  {
    key: "gotify",
    title: "Gotify",
    grid: "sm:grid-cols-2",
    fields: [
      { field: "gotifyUrl", label: "Server URL", env: "GOTIFY_URL", placeholder: "https://gotify.example.com" },
      { field: "gotifyToken", label: "App token", env: "GOTIFY_TOKEN", type: "password" },
    ],
  },
  {
    key: "ntfy",
    title: "ntfy",
    grid: "sm:grid-cols-3",
    fields: [
      { field: "ntfyUrl", label: "Server URL", env: "NTFY_URL", placeholder: "https://ntfy.sh" },
      { field: "ntfyTopic", label: "Topic", env: "NTFY_TOPIC", hint: "Pick something unguessable." },
      { field: "ntfyToken", label: "Token", env: "NTFY_TOKEN", hint: "Optional.", type: "password" },
    ],
  },
];

const isChannelConfigured = (s: Settings): Record<ChannelKey, boolean> => ({
  pushover: !!(s.pushoverToken && s.pushoverUser),
  telegram: !!(s.telegramBotToken && s.telegramChatId),
  gotify: !!(s.gotifyUrl && s.gotifyToken),
  ntfy: !!(s.ntfyUrl && s.ntfyTopic),
});

export default function SettingsPage() {
  const status = usePoll<MedicoverStatus>("/api/medicover/status", 15_000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [locked, setLocked] = useState<(keyof Settings)[]>([]);
  const [uaDefault, setUaDefault] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState<ChannelKey | null>(null);
  const [testResults, setTestResults] = useState<Partial<Record<ChannelKey, string>>>({});
  const [shownChannels, setShownChannels] = useState<Record<ChannelKey, boolean>>({
    pushover: false,
    telegram: false,
    gotify: false,
    ntfy: false,
  });
  const [dicts, setDicts] = useState<Filters | null>(null);
  const [dictsLoading, setDictsLoading] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api<SettingsPayload>("/api/settings")
      .then((p) => {
        setSettings(p.settings);
        setLocked(p.locked);
        setUaDefault(p.uaDefault);
        // Configured channels start expanded; the rest hide behind "add".
        setShownChannels((prev) => {
          const configured = isChannelConfigured(p.settings);
          return {
            pushover: prev.pushover || configured.pushover,
            telegram: prev.telegram || configured.telegram,
            gotify: prev.gotify || configured.gotify,
            ntfy: prev.ntfy || configured.ntfy,
          };
        });
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

  const testChannel = async (channel: ChannelKey) => {
    setTestBusy(channel);
    setTestResults((prev) => ({ ...prev, [channel]: undefined }));
    try {
      const r = await api<{ sent: string[]; errors: { channel: string; error: string }[] }>(
        "/api/notify/test",
        {
          method: "POST",
          body: JSON.stringify({ language: settings?.defaultLanguage ?? "pl", channel }),
        },
      );
      const err = r.errors.find((e) => e.channel === channel);
      setTestResults((prev) => ({
        ...prev,
        [channel]: err ? `✗ ${err.error}` : "✓ delivered",
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [channel]:
          `✗ ${(err as { payload?: { message?: string } }).payload?.message ?? (err instanceof Error ? err.message : err)}`,
      }));
    } finally {
      setTestBusy(null);
    }
  };

  const exportBackup = async () => {
    const res = await fetch("/api/backup");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `medibrowserr-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importBackup = async (file: File) => {
    setFlash(null);
    try {
      const body = await file.text();
      JSON.parse(body); // fail fast on non-JSON before hitting the API
      const r = await api<{ imported: number; skipped: number }>("/api/backup", {
        method: "POST",
        body,
      });
      setFlash(
        `Backup restored: ${r.imported} monitor${r.imported === 1 ? "" : "s"} imported` +
          (r.skipped ? `, ${r.skipped} skipped (name already exists)` : "") +
          ". Env-pinned settings were left untouched; reload to see changes.",
      );
    } catch (err) {
      setFlash(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
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
  const channelConfigured = isChannelConfigured(settings);

  /**
   * Text input that grays out when the value is pinned by an env var.
   * Deliberately a render *function*, not a nested component: a component
   * type recreated on each keystroke would remount the input, dropping
   * focus and reversing typed text.
   */
  const lockableInput = (field: TextField, type = "text", placeholder?: string) => (
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
                    "Sent with every Medicover request. Leave empty for the default shown; change it only if requests start getting blocked."
                  }
                >
                  {lockableInput("userAgent", "text", uaDefault)}
                </Field>
              </div>
            </div>
          </Card>
          <ConnectWizard status={status.data} onChanged={() => void status.reload()} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Notifications</h2>
          <p className="mb-3 max-w-2xl text-sm text-ink-soft">
            Every configured channel gets every alert — see the README for setup guides.
          </p>
          <div className="space-y-3">
            {CHANNELS.filter((c) => shownChannels[c.key]).map((c) => (
              <Card key={c.key} className="space-y-4 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{c.title}</h3>
                  <div className="flex items-center gap-3">
                    {testResults[c.key] ? (
                      <span className="text-[13px] text-ink-soft">{testResults[c.key]}</span>
                    ) : null}
                    <Button
                      size="sm"
                      disabled={testBusy === c.key || !channelConfigured[c.key]}
                      title={channelConfigured[c.key] ? `Send a test via ${c.title}` : "Save credentials first"}
                      onClick={() => void testChannel(c.key)}
                    >
                      {testBusy === c.key ? <Spinner className="h-3.5 w-3.5" /> : <Send size={13} />}
                      Test
                    </Button>
                  </div>
                </div>
                <div className={`grid gap-4 ${c.grid}`}>
                  {c.fields.map((f) => (
                    <Field
                      key={f.field}
                      label={f.label}
                      hint={envHint(f.field, f.env) ?? f.hint}
                    >
                      {lockableInput(f.field, f.type ?? "text", f.placeholder)}
                    </Field>
                  ))}
                </div>
              </Card>
            ))}

            {CHANNELS.some((c) => !shownChannels[c.key]) ? (
              <Card className="flex flex-wrap items-center gap-2 px-5 py-3.5">
                <span className="text-[13px] text-ink-soft">
                  {CHANNELS.every((c) => !shownChannels[c.key])
                    ? "No channel configured yet — add one:"
                    : "Add another channel:"}
                </span>
                {CHANNELS.filter((c) => !shownChannels[c.key]).map((c) => (
                  <Button
                    key={c.key}
                    size="sm"
                    onClick={() => setShownChannels((prev) => ({ ...prev, [c.key]: true }))}
                  >
                    <Plus size={13} /> {c.title}
                  </Button>
                ))}
              </Card>
            ) : null}

            <Card className="space-y-4 p-5">
              <h3 className="font-medium">Quiet hours</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Silence alerts overnight"
                  hint={
                    envHint("quietHoursEnabled", "MEDIBROWSERR_QUIET_HOURS_ENABLED") ??
                    "Alerts still arrive, just silently."
                  }
                >
                  <select
                    className={inputClass}
                    value={settings.quietHoursEnabled ? "on" : "off"}
                    disabled={isLocked("quietHoursEnabled")}
                    onChange={(e) => set("quietHoursEnabled", e.target.value === "on")}
                  >
                    <option value="off">Disabled</option>
                    <option value="on">Enabled</option>
                  </select>
                </Field>
                <Field
                  label="Hours (local time)"
                  hint={envHint("quietHours", "MEDIBROWSERR_QUIET_HOURS") ?? "May wrap midnight."}
                >
                  {lockableInput("quietHours", "text", "23-7")}
                </Field>
              </div>
            </Card>
          </div>
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
              <div className="sm:col-span-2">
                <Field
                  label="This app's URL"
                  hint={
                    envHint("appUrl", "MEDIBROWSERR_URL") ??
                    "Notification links open the app here, e.g. https://medibrowserr.home.lan. Empty = link to Medicover instead."
                  }
                >
                  {lockableInput("appUrl", "text", "https://medibrowserr.example.com")}
                </Field>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Backup</h2>
          <Card className="flex flex-wrap items-center gap-3 px-5 py-4">
            <p className="min-w-0 flex-1 text-sm text-ink-soft">
              Settings and monitor configurations. The export contains your credentials —
              store it safely. Importing never overrides env-pinned values, skips monitors
              whose name already exists, and the Medicover connection has to be redone once.
            </p>
            <Button onClick={() => void exportBackup()}>
              <Download size={15} /> Export
            </Button>
            <Button onClick={() => importRef.current?.click()}>
              <Upload size={15} /> Import
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importBackup(file);
                e.target.value = "";
              }}
            />
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

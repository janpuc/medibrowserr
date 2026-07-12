"use client";

import { useEffect, useState } from "react";
import { api, usePoll, type MedicoverStatus } from "@/lib/client";
import { Button, Card, Field, PageHeader, Spinner, inputClass } from "@/components/ui";
import { ConnectWizard } from "@/components/connect-wizard";

interface Settings {
  medicoverUser: string;
  medicoverPass: string;
  pushoverToken: string;
  pushoverUser: string;
  pushoverDevice: string;
  defaultLanguage: "pl" | "en";
  defaultIntervalMinutes: number;
  znanylekarzEnabled: boolean;
}

export default function SettingsPage() {
  const status = usePoll<MedicoverStatus>("/api/medicover/status", 15_000);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  useEffect(() => {
    void api<Settings>("/api/settings").then(setSettings).catch(() => setSettings(null));
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setFlash(null);
    try {
      const saved = await api<Settings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(saved);
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

  return (
    <>
      <PageHeader
        title="Settings"
        lead="Credentials stay in your own SQLite database on your own cluster."
      />

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Medicover</h2>
          <Card className="mb-3 space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Card number / login">
                <input
                  className={inputClass}
                  value={settings.medicoverUser}
                  onChange={(e) => set("medicoverUser", e.target.value)}
                  placeholder="e.g. 4612027"
                />
              </Field>
              <Field label="Password" hint="Shown as ••• once saved; type to replace.">
                <input
                  className={inputClass}
                  type="password"
                  value={settings.medicoverPass}
                  onChange={(e) => set("medicoverPass", e.target.value)}
                />
              </Field>
            </div>
          </Card>
          <ConnectWizard status={status.data} onChanged={() => void status.reload()} />
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Pushover</h2>
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Application token" hint="Create an app at pushover.net/apps.">
                <input
                  className={inputClass}
                  type="password"
                  value={settings.pushoverToken}
                  onChange={(e) => set("pushoverToken", e.target.value)}
                />
              </Field>
              <Field label="User key">
                <input
                  className={inputClass}
                  value={settings.pushoverUser}
                  onChange={(e) => set("pushoverUser", e.target.value)}
                />
              </Field>
              <Field label="Device (optional)" hint="Empty = all devices.">
                <input
                  className={inputClass}
                  value={settings.pushoverDevice}
                  onChange={(e) => set("pushoverDevice", e.target.value)}
                />
              </Field>
            </div>
            <Button onClick={() => void testPushover()} disabled={testBusy}>
              {testBusy ? <Spinner /> : null}
              Send test notification
            </Button>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Defaults</h2>
          <Card className="grid gap-4 p-5 sm:grid-cols-3">
            <Field label="Message language" hint="Preselected for new monitors.">
              <select
                className={inputClass}
                value={settings.defaultLanguage}
                onChange={(e) => set("defaultLanguage", e.target.value as "pl" | "en")}
              >
                <option value="pl">Polski</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="Sweep interval (minutes)">
              <input
                className={inputClass}
                type="number"
                min={5}
                max={1440}
                value={settings.defaultIntervalMinutes}
                onChange={(e) =>
                  set("defaultIntervalMinutes", Number(e.target.value) || 15)
                }
              />
            </Field>
            <Field label="ZnanyLekarz lookups" hint="Doctor photos & ratings on tickets.">
              <select
                className={inputClass}
                value={settings.znanylekarzEnabled ? "on" : "off"}
                onChange={(e) => set("znanylekarzEnabled", e.target.value === "on")}
              >
                <option value="on">Enabled</option>
                <option value="off">Disabled</option>
              </select>
            </Field>
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
      </div>
    </>
  );
}

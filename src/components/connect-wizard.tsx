"use client";

import { useState } from "react";
import { CheckCircle2, PlugZap, ShieldAlert } from "lucide-react";
import { api, type MedicoverStatus } from "@/lib/client";
import { Badge, Button, Card, Field, inputClass, Spinner } from "@/components/ui";

type Step = "idle" | "mfa_setup" | "mfa_code";

/**
 * Connects the Medicover account. Password login normally suffices; the
 * first time, Medicover may force MFA enrollment (email or SMS code). After
 * one successful code the device is trusted and everything is automatic.
 */
export function ConnectWizard({
  status,
  onChanged,
}: {
  status: MedicoverStatus | null;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>(() =>
    status?.pending ? (status.pending.kind === "mfa_setup" ? "mfa_setup" : "mfa_code") : "idle",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<"Email" | "SMS">("Email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const run = async (fn: () => Promise<Step | "connected">) => {
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      if (next === "connected") {
        setStep("idle");
        setCode("");
      } else {
        setStep(next);
      }
      onChanged();
    } catch (err) {
      const payload = (err as { payload?: { detail?: string; message?: string } }).payload;
      setError(payload?.detail ?? (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const res = await api<{ status: string }>("/api/medicover/connect", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (res.status === "connected") return "connected";
      if (res.status === "mfa_setup") return "mfa_setup";
      return "mfa_code";
    });

  const sendChannel = () =>
    run(async () => {
      await api("/api/medicover/connect/channel", {
        method: "POST",
        body: JSON.stringify({
          channel,
          ...(channel === "Email" && email ? { email } : {}),
          ...(channel === "SMS" && phone ? { phone, phonePrefix: "+48" } : {}),
        }),
      });
      return "mfa_code";
    });

  const verify = () =>
    run(async () => {
      await api("/api/medicover/connect/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      return "connected";
    });

  const connected = status?.status === "connected";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        {connected ? (
          <CheckCircle2 className="text-found" size={20} />
        ) : status?.status === "action_required" ? (
          <ShieldAlert className="text-amber" size={20} />
        ) : (
          <PlugZap className="text-ink-soft" size={20} />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Medicover account{" "}
            {connected ? (
              <Badge tone="found">connected</Badge>
            ) : status?.status === "action_required" ? (
              <Badge tone="amber">action required</Badge>
            ) : (
              <Badge tone="neutral">not connected</Badge>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {connected && status?.profile?.firstName
              ? `Signed in as ${status.profile.firstName} ${status.profile.lastName ?? ""} (MRN ${status.profile.mrn ?? "—"})`
              : (status?.statusDetail ??
                "Uses the card number and password from the form above.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void connect()} disabled={busy}>
            {busy && step === "idle" ? <Spinner className="border-white/40 border-t-white" /> : null}
            {connected ? "Reconnect" : "Connect"}
          </Button>
          {connected ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/api/medicover/disconnect", { method: "POST" });
                  return "idle" as const;
                })
              }
            >
              Disconnect
            </Button>
          ) : null}
        </div>
      </div>

      {step === "mfa_setup" ? (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm">
            <span className="font-semibold">One-time MFA setup.</span> Medicover now requires
            a verification method on every account. Pick where to receive the 6-digit code —
            after this one confirmation the app&apos;s device is trusted and future logins are
            automatic.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="flex gap-2">
              {(["Email", "SMS"] as const).map((c) => (
                <Button
                  key={c}
                  variant={channel === c ? "primary" : "secondary"}
                  onClick={() => setChannel(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
            {channel === "Email" ? (
              <Field label="E-mail for codes">
                <input
                  className={inputClass}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
            ) : (
              <Field label="Phone (+48)">
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="600 000 000"
                />
              </Field>
            )}
            <Button variant="primary" onClick={() => void sendChannel()} disabled={busy}>
              {busy ? <Spinner className="border-white/40 border-t-white" /> : null}
              Send code
            </Button>
          </div>
        </div>
      ) : null}

      {step === "mfa_code" ? (
        <div className="mt-5 border-t border-line pt-5">
          <p className="text-sm">
            <span className="font-semibold">Enter the 6-digit code</span>
            {status?.pending?.channelHint ? ` sent to ${status.pending.channelHint}` : ""} —
            the device will be remembered, so this is a one-off.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <input
              className={`${inputClass} w-36 text-center font-mono text-lg tracking-[0.3em]`}
              value={code}
              maxLength={6}
              inputMode="numeric"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
            />
            <Button
              variant="primary"
              onClick={() => void verify()}
              disabled={busy || code.length !== 6}
            >
              {busy ? <Spinner className="border-white/40 border-t-white" /> : null}
              Confirm
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-lg bg-alert-wash px-3 py-2 text-[13px] text-alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}

import { NextResponse } from "next/server";
import {
  MedicoverAuthError,
  MfaInteractionRequired,
} from "@/server/medicover/auth";
import { MedicoverApiError } from "@/server/medicover/client";

/** Uniform error mapping for route handlers. */
export function apiError(err: unknown): NextResponse {
  if (err instanceof MfaInteractionRequired) {
    return NextResponse.json(
      {
        error: "mfa_required",
        kind: err.state.kind,
        message: "Medicover requires an MFA step — finish connecting in Settings.",
      },
      { status: 409 },
    );
  }
  if (err instanceof MedicoverAuthError) {
    return NextResponse.json(
      { error: "auth_failed", message: err.message, detail: err.detail },
      { status: 502 },
    );
  }
  if (err instanceof MedicoverApiError) {
    return NextResponse.json(
      { error: "medicover_api", message: err.message, detail: err.body },
      { status: 502 },
    );
  }
  console.error("[api]", err);
  return NextResponse.json(
    { error: "internal", message: err instanceof Error ? err.message : "Unexpected error" },
    { status: 500 },
  );
}

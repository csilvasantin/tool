import { validateDeployIdentity } from "../../yokup-site/deploy-signature.mjs";

export const PRIMARY_ORIGIN = "https://yokup.pages.dev";
export const FALLBACK_ORIGIN = "https://adc0c9e3.yokup.pages.dev";
export const TRUSTED_AFTER = "2026-08-10T06:58:15.636Z";

const VERSION = /^v\.\d{2}\.\d{2}\.\d{4}\.r\d+\.\d{2}:\d{2}$/i;
const FULL_SHA = /^[a-f0-9]{40}$/i;
const SHORT_SHA = /^[a-f0-9]{7,40}$/i;

export function assessProvenance(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { trusted:false, reason:"missing-provenance" };
  if (!VERSION.test(String(payload.version || ""))) return { trusted:false, reason:"invalid-version" };
  if (payload.dirty !== false) return { trusted:false, reason:"dirty-or-unsigned" };
  const full = String(payload.gitFull || ""), short = String(payload.gitShort || payload.git || "");
  if (!FULL_SHA.test(full) || !SHORT_SHA.test(short) || !full.startsWith(short)) return { trusted:false, reason:"invalid-git" };
  const deployedAt = Date.parse(String(payload.deployedAt || ""));
  if (!Number.isFinite(deployedAt) || deployedAt < Date.parse(TRUSTED_AFTER)) return { trusted:false, reason:"before-recovery-floor" };
  try {
    const identity = validateDeployIdentity(payload.deployer, payload.machine);
    if (identity.deployer !== payload.deployer || identity.machine !== payload.machine || identity.signature !== payload.signature) {
      return { trusted:false, reason:"invalid-signature" };
    }
  } catch (_) {
    return { trusted:false, reason:"invalid-signature" };
  }
  return { trusted:true, reason:"signed-clean-release" };
}

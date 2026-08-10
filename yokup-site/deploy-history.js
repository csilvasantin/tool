import { versionFromPayload } from "./deploy-version.js";
import { validateDeployIdentity } from "./deploy-signature.mjs";

const VERSION = /^v\.\d{2}\.\d{2}\.\d{4}\.r\d+(?:\.\d{2}:\d{2})?$/i;
const FULL_SHA = /^[a-f0-9]{40}$/i;
const SHORT_SHA = /^[a-f0-9]{7,40}$/i;

export function signedVersionFromPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const version = versionFromPayload(payload);
  if (!VERSION.test(version) || payload.dirty !== false) return "";
  if (!FULL_SHA.test(String(payload.gitFull || "")) || !SHORT_SHA.test(String(payload.gitShort || payload.git || ""))) return "";
  if (!String(payload.gitFull).startsWith(String(payload.gitShort || payload.git))) return "";
  if (!Number.isFinite(Date.parse(String(payload.deployedAt || "")))) return "";
  try {
    const identity = validateDeployIdentity(payload.deployer, payload.machine);
    if (identity.deployer !== payload.deployer || identity.machine !== payload.machine || identity.signature !== payload.signature) return "";
  } catch (_) {
    return "";
  }
  return version;
}

export function deploymentUrlsFromJson(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    const start = raw.indexOf("[");
    if (start < 0) return [];
    try { parsed = JSON.parse(raw.slice(start)); } catch (_) { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((item) => String(item && (item.Deployment || item.deployment || item.url) || "").trim())
    .filter((url) => /^https:\/\/[a-f0-9-]+\.yokup\.pages\.dev\/?$/i.test(url)))];
}

export async function signedVersionsFromDeployments(deployments, fetchImpl = fetch) {
  const urls = deploymentUrlsFromJson(deployments);
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetchImpl(url.replace(/\/$/, "") + "/version.json?history=" + Date.now(), {
        cache:"no-store",
        signal:AbortSignal.timeout(6000)
      });
      if (!response.ok) return "";
      return signedVersionFromPayload(await response.json());
    } catch (_) {
      return "";
    }
  }));
  return [...new Set(results.filter(Boolean))];
}

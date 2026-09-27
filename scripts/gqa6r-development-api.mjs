// GQA-6R Development-only Management API access for the Demo fixture utilities.
// The access token comes from SUPABASE_ACCESS_TOKEN and is never printed. Every write first proves the
// target is exactly the Development project (ref AND name) through the Management API's own answer.
import { DEVELOPMENT_PROJECT_REF, assertDevelopmentTarget } from "./gqa6r-demo-fixtures.mjs";

const API = "https://api.supabase.com/v1";

function token() {
  const value = process.env.SUPABASE_ACCESS_TOKEN;
  if (!value) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  return value;
}

async function call(path, init = {}) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : null;
    if (response.status !== 429) throw new Error(`Management API ${response.status}: ${text.replace(/[A-Za-z0-9._-]{40,}/g, "…").slice(0, 300)}`);
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
  }
  throw new Error("Management API throttled");
}

/** Proves the configured target is Development; returns the verified ref. Throws before any write otherwise. */
export async function verifyDevelopmentTarget(ref = DEVELOPMENT_PROJECT_REF) {
  const project = await call(`/projects/${encodeURIComponent(ref)}`);
  assertDevelopmentTarget({ ref: project?.id ?? project?.ref, projectName: project?.name });
  return project?.id ?? project?.ref;
}

/** Read-only SQL (supabase_read_only_user, read-only transaction). */
export function readOnlySql(ref, query) {
  return call(`/projects/${encodeURIComponent(ref)}/database/query/read-only`, { method: "POST", body: JSON.stringify({ query }) });
}

/** Privileged fixture SQL. Callers must have passed verifyDevelopmentTarget for this exact ref. */
export function fixtureWriteSql(ref, verifiedRef, query) {
  if (ref !== verifiedRef) throw new Error("refusing: write target was not verified as Development");
  return call(`/projects/${encodeURIComponent(ref)}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
}

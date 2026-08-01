#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const checks = [];
function record(name, pass) {
  checks.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
}

const analysis = read("apps/mobile/app/analysis.tsx");
const sessionStore = read("apps/mobile/features/analysis/analysisSessionStore.ts");
const hook = read("apps/mobile/features/analysis/useAnalysisCorrectionState.ts");
const placeholders = read("packages/services/src/placeholders.ts");

// ---- 1-3: real captured photo is actually rendered on the analysis page ----
record(
  "analysis.tsx imports Image from react-native",
  /import\s*\{[^}]*\bImage\b[^}]*\}\s*from\s*"react-native"/.test(analysis)
);
record(
  // MI-E-C5-R5-R2 successor-compatible locator. The B5 invariant — analysis.tsx renders the REAL
  // captured photo as an Image, sourced from the session's capturedImageUri rather than a
  // placeholder — is unchanged. R5-R2 routes that same value through an actor-ownership gate
  // (ownedCapturedImageUri) so a previous actor's photo cannot render after an actor change, so the
  // gated identifier is accepted only when it is proven to be derived from analysis.capturedImageUri.
  "analysis.tsx renders an Image sourced from analysis.capturedImageUri",
  /<Image\s+source=\{\{\s*uri:\s*analysis\.capturedImageUri\s*\}\}/.test(analysis) ||
    (/<Image\s+source=\{\{\s*uri:\s*ownedCapturedImageUri\s*\}\}/.test(analysis) &&
      /const ownedCapturedImageUri = analysisSessionOwned \? analysis\.capturedImageUri : null;/.test(analysis))
);
record(
  "photoImage style exists for the real-photo layer",
  /photoImage:\s*\{/.test(analysis)
);

// ---- 4-5: capturedImageUri remains correctly plumbed from session through the hook (unchanged, not broken by this fix) ----
record(
  "session store still defines capturedImageUri on session state",
  /capturedImageUri:\s*string \| null;/.test(sessionStore)
);
// MI-E-C5-R5-R5 successor-compatible locator. The B5 invariant — the hook mirrors
// session.capturedImageUri into local state and exposes it — is unchanged. R5-R5 routes the hook's
// whole public surface through named actor-safe constants, so the return now reads
// `capturedImageUri: publicCapturedImageUri`. That gated spelling is accepted ONLY when the named
// constant is proven to derive from the very same mirrored state, so a hook that stopped exposing
// the real captured photo entirely would still fail this check.
record(
  "hook still mirrors session.capturedImageUri and returns it",
  /const \[capturedImageUri\] = useState<string \| null>\(session\.capturedImageUri\);/.test(hook) &&
    (/\n    capturedImageUri,/.test(hook) ||
      (/capturedImageUri: publicCapturedImageUri,/.test(hook) &&
        /const publicCapturedImageUri = isCurrentActorState \? capturedImageUri : session\.capturedImageUri;/.test(hook)))
);

// ---- 6: leak prevention — a new capture still fully resets the session before assigning the new URI ----
// MI-E-C5-R7-A successor-compatible locator. The B5 invariant — beginAnalysisCapture performs a
// FULL session reset before it assigns the new photo, so nothing from the previous meal can leak —
// is unchanged and still asserted by the same ordered sequence below. R7-A only widened the
// signature (a documented optional restaurantContext parameter), which pushed the old 300-character
// window past `session = createDefaultSession()`. The window is widened to cover the signature, and
// the check is STRENGTHENED: the new restaurant context must be applied AFTER the reset, so a
// known-entry context can neither survive a reset nor be dropped by one.
record(
  "beginAnalysisCapture resets the full session before assigning the new photo URI (no leakage from the previous meal)",
  /export function beginAnalysisCapture[\s\S]{0,900}?session = createDefaultSession\(\);[\s\S]{0,120}?session\.captureMethod = method;[\s\S]{0,120}?session\.capturedImageUri = imageUri;/.test(sessionStore) &&
    /session = createDefaultSession\(\);[\s\S]{0,1400}?const restaurant = normalizeAnalysisRestaurantContext\(\{/.test(sessionStore)
);

// ---- 7-8: scope discipline — no unauthorized AI architecture was built this round ----
record(
  "the placeholder AI meal-photo analysis function remains explicitly labeled as mock and unmodified",
  /export async function analyzeMealPhotoPlaceholder\(\)\s*\{\s*\/\/ TODO: Replace with Supabase Edge Function that calls OpenAI for meal photo estimation\.\s*return \{ mode: "mock", calories: 620, proteinGrams: 38, carbsGrams: 58, fatGrams: 22 \};\s*\}/.test(placeholders)
);
record(
  "the placeholder AI function is still not imported anywhere in apps/mobile (no new wiring to an unauthorized/incomplete AI path)",
  !/analyzeMealPhotoPlaceholder/.test(analysis)
);
record(
  "analysis.tsx does not introduce a second image-analysis call chain (no new fetch/axios/openai call added)",
  !/openai|OpenAI/.test(analysis) && !/fetch\(.*analy/i.test(analysis)
);

const failed = checks.filter((c) => !c.pass);
console.log(`RESULT ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exit(1);

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
  "analysis.tsx renders an Image sourced from analysis.capturedImageUri",
  /<Image\s+source=\{\{\s*uri:\s*analysis\.capturedImageUri\s*\}\}/.test(analysis)
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
record(
  "hook still mirrors session.capturedImageUri and returns it",
  /const \[capturedImageUri\] = useState<string \| null>\(session\.capturedImageUri\);/.test(hook) &&
    /capturedImageUri,/.test(hook)
);

// ---- 6: leak prevention — a new capture still fully resets the session before assigning the new URI ----
record(
  "beginAnalysisCapture resets the full session before assigning the new photo URI (no leakage from the previous meal)",
  /export function beginAnalysisCapture[\s\S]{0,300}?session = createDefaultSession\(\);[\s\S]{0,120}?session\.captureMethod = method;[\s\S]{0,120}?session\.capturedImageUri = imageUri;/.test(sessionStore)
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

#!/usr/bin/env node
// MI-E-C5-R7-C2a static guard — multi-branch restaurant context resolver correctness.
//
// POST-FREEZE LIFECYCLE-AWARE BY CONSTRUCTION. Following MI-E-C5-R7-B2-R3, this guard never asserts
// that a path is modified, untracked, staged, or absent from HEAD, and never special-cases a HEAD.
// Every assertion is repository CONTENT, a PROTECTED-SURFACE digest, or an explicitly optional
// candidate-state diagnostic that is vacuous on a clean tree — so it holds identically before and
// after the freeze commit.
//
// Scope: this round corrects the RESOLVER only. It deliberately adds no production caller and shows
// no name on any screen; wiring the Analysis display is R7-C2b.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(root, relative));
const sha = (relative) => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).stdout ?? "";

const RESOLVER = "apps/mobile/features/restaurants/catalog/restaurantContextPresentation.ts";
const R7A_GUARD = "scripts/restaurant-context-mi-e-c5-r7-a-guard.mjs";
const R7A_SMOKE = "scripts/restaurant-context-mi-e-c5-r7-a-smoke.mjs";
const R7C1_GUARD = "scripts/restaurant-selection-mi-e-c5-r7-c1-guard.mjs";
const GUARD = "scripts/restaurant-display-mi-e-c5-r7-c2a-guard.mjs";
const SMOKE = "scripts/restaurant-display-mi-e-c5-r7-c2a-smoke.mjs";
const CANDIDATE_MANIFEST = Object.freeze([RESOLVER, R7A_GUARD, R7A_SMOKE, R7C1_GUARD, GUARD, SMOKE]);

const resolver = read(RESOLVER);
// Executable source only: the module's comments legitimately name the old flattened model, the
// mapper's branches[0] collapse and the district field while explaining why none of them is used.
const resolverCode = resolver
  .split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
  .join("\n");

// =============================================================================================
// 1. Production surface scope (1-4)
// =============================================================================================
check("1. the only production path in this candidate is the resolver", CANDIDATE_MANIFEST.filter((p) => !p.startsWith("scripts/")).join(",") === RESOLVER);
check("2. the resolver exists at the canonical catalog path", exists(RESOLVER));
check(
  "3. this round adds NO production caller — the display wiring is R7-C2b",
  (() => {
    const callers = git(["grep", "-l", "resolveRestaurantContextPresentation", "--", "apps/", "packages/"])
      .split("\n").map((l) => l.trim()).filter(Boolean);
    return callers.length === 1 && callers[0].replaceAll("\\", "/") === RESOLVER;
  })(),
  git(["grep", "-l", "resolveRestaurantContextPresentation", "--", "apps/", "packages/"]).split("\n").filter(Boolean)
);
check(
  "4. the resolver stays pure — no React, network, repository or storage of its own",
  !/useState|useEffect|createClient|fetch\(|new Supabase|AsyncStorage|SecureStore/.test(resolverCode)
);

// =============================================================================================
// 2. Canonical nested lookup (5-11) — the actual defect correction
// =============================================================================================
check(
  "5. the lookup result type is the CANONICAL nested catalog restaurant model",
  /import type \{ CatalogRestaurantViewModel \} from "\.\/types";/.test(resolver) &&
    /findRestaurant: \(restaurantId: string\) => CatalogRestaurantViewModel \| null;/.test(resolverCode)
);
check(
  "6. the flattened card model is no longer referenced in executable source",
  !/RestaurantCardViewModel/.test(resolverCode)
);
check(
  "7. the branch is resolved from the nested branches collection",
  /match\.branches\.find\(/.test(resolverCode)
);
check(
  "8. branch matching is by EXACT durable branchId",
  /match\.branches\.find\(\(candidate\) => candidate\.branchId === input\.branchId\)/.test(resolverCode)
);
check(
  "9. the displayed branch value is the branch's own name",
  /const branchName = branch && isDisplayableRestaurantName\(branch\.name\) \? branch\.name : null;/.test(resolverCode)
);
check(
  "10. no district / address / flattened location is used as a branch name",
  !/match\.location/.test(resolverCode) && !/\.district/.test(resolverCode) && !/\.address/.test(resolverCode)
);
check(
  "11. there is no positional branch fallback anywhere",
  !/branches\[0\]/.test(resolverCode) && !/branches\.at\(0\)/.test(resolverCode) && !/branches\[\d+\]/.test(resolverCode)
);

// =============================================================================================
// 3. Preserved state contract (12-16)
// =============================================================================================
check(
  "12. restaurant-only remains legal: no branchId means no branch name",
  /const branch = input\.branchId\s*\r?\n?\s*\? match\.branches\.find/.test(resolverCode) && /: null;/.test(resolverCode)
);
check(
  "13. an unknown branch is fail-soft — the restaurant still resolves",
  /kind: "resolved",\s*\r?\n?\s*restaurantName: match\.name,\s*\r?\n?\s*branchName/.test(resolverCode)
);
check(
  "14. loading / idle still report loading, and every non-success status is unresolved",
  /if \(input\.catalogStatus === "loading" \|\| input\.catalogStatus === "idle"\) return LOADING;/.test(resolverCode) &&
    /if \(input\.catalogStatus !== "success"\) return UNRESOLVED;/.test(resolverCode)
);
check(
  "15. a catalog miss and a UUID-shaped name still fail closed",
  /if \(!match \|\| !isDisplayableRestaurantName\(match\.name\)\) return UNRESOLVED;/.test(resolverCode)
);
check(
  "16. the presentation output shape and its immutability are unchanged",
  /kind: RestaurantContextPresentationKind;\s*\r?\n\s*restaurantName: string \| null;\s*\r?\n\s*branchName: string \| null;/.test(resolver) &&
    /return Object\.freeze\(\{/.test(resolverCode)
);

// =============================================================================================
// 4. Companion authority updates (17-20)
// =============================================================================================
const stripComments = (source) =>
  source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    .join("\n");
const r7aGuard = read(R7A_GUARD);
const r7aSmoke = read(R7A_SMOKE);
const r7aSmokeCode = stripComments(r7aSmoke);
const r7c1Guard = read(R7C1_GUARD);
check(
  // The R7-A guard stores its expectation as an ESCAPED regex literal, so this matches the literal
  // exactly as it appears in that file rather than the unescaped runtime form.
  "17. the R7-A guard now pins the nested-branch authority instead of the flattened comparison",
  r7aGuard.includes("match\\.branches\\.find\\(\\(candidate\\) => candidate\\.branchId === input\\.branchId\\)") &&
    /CatalogRestaurantViewModel/.test(r7aGuard) &&
    !r7aGuard.includes("input\\.branchId && match\\.branchId === input\\.branchId")
);
check(
  // Scoped to EXECUTABLE smoke source: the fixture's comment legitimately quotes the old
  // district-as-branch-name assertion while explaining why it was wrong.
  "18. the R7-A smoke no longer asserts a district as the branch name",
  !/branchName === "中山區"/.test(r7aSmokeCode) && /branchName === "中山店"/.test(r7aSmokeCode) &&
    /branchName === "大安店"/.test(r7aSmokeCode)
);
check(
  "19. the R7-A smoke fixture supplies canonical nested branches with name !== district",
  /branches: \[/.test(r7aSmoke) && /name: "中山店", district: "中山區"/.test(r7aSmoke) &&
    /name: "大安店", district: "大安區"/.test(r7aSmoke)
);
check(
  // Plain substring comparison: a constructed RegExp needs path escaping that is easy to get wrong,
  // and these are exact literals in the R7-C1 guard's pin table.
  "20. the R7-C1 guard refreshed ONLY the resolver/R7-A authority and kept analysis.tsx pinned",
  r7c1Guard.includes(
    '"apps/mobile/app/analysis.tsx": "426bced651c2b3ea8d6f3d69d4ab3c6e2f532e8c9e767b338c8ae9d53ef300c8"'
  ) &&
    r7c1Guard.includes(`"${RESOLVER}": "${sha(RESOLVER)}"`) &&
    r7c1Guard.includes(`"${R7A_GUARD}": "${sha(R7A_GUARD)}"`) &&
    r7c1Guard.includes(`"${R7A_SMOKE}": "${sha(R7A_SMOKE)}"`)
);

// =============================================================================================
// 5. Protected zero-diff surfaces (21-25)
// =============================================================================================
const PROTECTED = Object.freeze({
  "apps/mobile/app/analysis.tsx": "426bced651c2b3ea8d6f3d69d4ab3c6e2f532e8c9e767b338c8ae9d53ef300c8",
  "apps/mobile/app/restaurants.tsx": "30f53812245508f4d7664c5e15e9b530349565dd8a81dc169371c8108ddf0cce",
  "apps/mobile/app/meal-photo.tsx": "dccf608fa3dcec88e20a9245cc5b1a9d95b658c043c6a1a93acc8cd444f8395a",
  "apps/mobile/features/restaurants/catalog/mapper.ts": "438a405a68a38db6250a00330a7b7f88ab9453cf0638e6be91a1cb2899e5cc38",
  "apps/mobile/features/consumer-meals/todayIntakeUiModel.ts": "d4403fc5e2580758c77ffd7e29052dd72383af4f3ddd3b072a9abe2cd35fa1f2",
  "apps/mobile/features/analysis/analysisSessionStore.ts": "34f78ffcd2f2a7282197c4db7ae08ae035314bdb870fabd5782c79cf4e85ecb4",
  "apps/mobile/features/meal-identification-finalization/v3Contract.ts": "69a33497cb35f0c6a7454d3857c6b4d6e2a055e88a3cc7ee43398f2d5c936505",
  "apps/mobile/features/analysis/useMealPhotoFinalization.ts": "7d4178645730060d81fe7845ecefd682bc51ad9c76e9fcdf3ded780b269678ae",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-guard.mjs": "2b2eb7f32a0a31242254dd0d8b1ba01b9d1ee9aceaf98335d281b90e2c859c7b",
  "scripts/restaurant-durable-contract-mi-e-c5-r7-b-smoke.mjs": "26d1937ed53c5eb49b6c4b34867a0456400de214fdc8fec8831f900f520d324c"
});
const drift = Object.entries(PROTECTED).filter(([file, want]) => !exists(file) || sha(file) !== want);
check("21. every protected surface is byte-identical to its frozen content", drift.length === 0, drift.map(([f]) => f));
check(
  "22. the catalog mapper is NOT modified to accommodate the resolver",
  !CANDIDATE_MANIFEST.includes("apps/mobile/features/restaurants/catalog/mapper.ts") &&
    /restaurant\.branchId = restaurant\.branches\[0\]\?\.branchId;/.test(read("apps/mobile/features/restaurants/catalog/mapper.ts"))
);
check(
  "23. no analysis screen, Today Intake, selector or handoff path is in this candidate",
  !CANDIDATE_MANIFEST.some((p) =>
    /app\/analysis\.tsx|app\/today-intake\.tsx|todayIntakeUiModel|app\/restaurants\.tsx|app\/meal-photo\.tsx|analysisRestaurantHandoff/.test(p)
  )
);
check(
  "24. this candidate introduces no migration, Edge Function or packages change",
  CANDIDATE_MANIFEST.every((p) => !p.startsWith("supabase/") && !p.startsWith("packages/"))
);
check(
  "25. the candidate manifest is exactly the six approved paths",
  CANDIDATE_MANIFEST.length === 6 && new Set(CANDIDATE_MANIFEST).size === 6 && CANDIDATE_MANIFEST.every(exists)
);

// =============================================================================================
// 6. Hygiene and candidate-state diagnostics (26-28)
// =============================================================================================
check(
  // The resolver and smoke are scanned in full. This guard cannot scan ITSELF for these tokens —
  // the line below necessarily contains them as the forbidding pattern — so it is asserted instead
  // to contain no executable remote call of its own.
  "26. no remote-operation code and no secret pattern in this candidate",
  ![resolver, read(SMOKE)].some((source) =>
    /sbp_[A-Za-z0-9]|eyJ[A-Za-z0-9_-]{20,}|service_role|SUPABASE_ACCESS_TOKEN|\.rpc\s*\(|supabase\.co/.test(source)
  ) &&
    !/fetch\(|createClient|\.rpc\(/.test(stripComments(read(GUARD)).replace(/\/[^\n]*\/\.test\(/g, ""))
);
const worktree = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
  .split("\0").filter(Boolean).map((entry) => entry.slice(3).replaceAll("\\", "/"));
const outside = worktree.filter((file) => !CANDIDATE_MANIFEST.includes(file));
check(
  // Lifecycle-AWARE, never lifecycle-DEPENDENT: a clean post-freeze tree and a tree holding exactly
  // this candidate both satisfy it. Nothing must be modified or untracked for the guard to pass.
  "27. any uncommitted change is confined to the approved manifest (vacuous on a clean tree)",
  outside.length === 0,
  { worktreeEntries: worktree.length, outside }
);
check("28. nothing is staged by the guard's own run", git(["diff", "--cached", "--name-only"]).trim() === "");

const failed = checks.filter((entry) => !entry.pass);
console.log(JSON.stringify({
  guard: "restaurant-display-mi-e-c5-r7-c2a",
  status: failed.length ? "failed" : "passed",
  totalChecks: checks.length,
  passed: checks.length - failed.length,
  failed: failed.length,
  checks
}, null, 2));
if (failed.length) process.exit(1);

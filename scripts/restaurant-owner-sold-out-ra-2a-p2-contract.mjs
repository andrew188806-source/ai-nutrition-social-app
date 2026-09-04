import fs from "node:fs";
import path from "node:path";
import {
  P2_MUTATION_RPC, P2_PREVIEW_RPC, P2_ROUTE, P2_FORBIDDEN_BRANCHES, P2_FORBIDDEN_TARGETS
} from "./restaurant-owner-sold-out-ra-2a-p2-successor-manifest.mjs";

export const P2_FILES = Object.freeze({
  types: "apps/restaurant-web/runtime/restaurant-owner-sold-out.ts",
  repository: "apps/restaurant-web/repositories/supabase/restaurant-owner-sold-out-repository.ts",
  runtime: "apps/restaurant-web/server/restaurant-owner-sold-out-runtime.ts",
  route: "apps/restaurant-web/app/api/restaurant/branches/[branchId]/menu-items/[branchMenuItemId]/sold-out/route.ts",
  component: "apps/restaurant-web/components/menu/RestaurantOwnerSoldOutControl.tsx",
  views: "apps/restaurant-web/components/runtime/LiveRestaurantViews.tsx",
  menuPage: "apps/restaurant-web/app/restaurant/menu/page.tsx",
  factory: "apps/restaurant-web/services/restaurant-runtime-service-factory.ts",
  harness: "scripts/restaurant-owner-sold-out-ra-2a-p2-development-acceptance.mjs",
  docs: "docs/restaurant-owner-sold-out-ra-2a-p2.md"
});

export const read = (root, file) => fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
export const readP2Sources = (root = process.cwd()) => Object.fromEntries(
  Object.entries(P2_FILES).map(([key, file]) => [key, read(root, file)])
);

function bodyBetween(source, start, end) {
  const first = source.indexOf(start);
  if (first < 0) return "";
  const last = source.indexOf(end, first);
  return last < 0 ? source.slice(first) : source.slice(first, last);
}

export function auditApplicationSources(source) {
  const checks = [];
  const claim = (name, pass) => checks.push({ name, pass: Boolean(pass) });
  const previewHandler = bodyBetween(source.runtime, "export async function handleRestaurantOwnerSoldOutPreviewRequest", "export async function handleRestaurantOwnerSoldOutMutationRequest");
  const mutationHandler = bodyBetween(source.runtime, "export async function handleRestaurantOwnerSoldOutMutationRequest", "\n// P2_RUNTIME_END");
  const submit = bodyBetween(source.component, "async function submit()", "\n  if (loading)");
  const uncertain = bodyBetween(source.component, "async function reconcileUncertain", "async function submit");
  const repositoryMutation = bodyBetween(source.repository, "async mutate(", "\n    }\n  };");

  claim("the route is the one fixed Restaurant sold-out resource",
    P2_ROUTE.includes("[branchId]") && source.route.includes("handleRestaurantOwnerSoldOutPreviewRequest")
    && source.route.includes("handleRestaurantOwnerSoldOutMutationRequest")
    && /export async function GET/.test(source.route) && /export async function POST/.test(source.route));
  claim("the route disables static caching", source.route.includes('dynamic = "force-dynamic"') && source.route.includes("revalidate = 0"));
  claim("the server authenticates through canonical Restaurant claims",
    source.runtime.includes("getVerifiedRestaurantClaims") && !/authorization|Bearer|localStorage/i.test(source.runtime));
  claim("caller identity role and permission claims never become shortcuts",
    !/(ownerId|userId|callerRole|callerPermission|role\s*===\s*["'](?:owner|manager|staff)|permission\s*===)/.test(
      source.types + source.repository + source.runtime));
  claim("disabled and mock runtimes cannot become live mutation transports",
    /getRestaurantDataSourceConfig\(\)\.dataSource !== "supabase"/.test(source.runtime)
    && !/createRestaurantOwnerSoldOutRepository/.test(source.factory));

  claim("GET uses only the frozen R1 preview RPC",
    source.types.includes(`"${P2_PREVIEW_RPC}" as const`)
    && source.repository.includes("client.rpc(RESTAURANT_OWNER_SOLD_OUT_PREVIEW_RPC")
    && previewHandler.includes(".preview(")
    && !previewHandler.includes(".mutate("));
  claim("the ordinary menu read never supplies write version authority",
    !/soldOutVersion|sold_out_version/.test(source.views)
    && !/soldOutVersion|sold_out_version/.test(source.menuPage));
  claim("the sold-out repository has no direct table read fallback",
    !/\.from\s*\(|branch_menu_items/.test(source.repository));
  claim("preview uses selected Restaurant only as an R1 selector",
    previewHandler.includes("loadRestaurantAccessContext")
    && previewHandler.includes(".preview(access.restaurant.id, branchId, branchMenuItemId)"));
  claim("preview rejects query parameters and malformed route identities",
    previewHandler.includes("searchParams.keys()") && previewHandler.includes("readBoundedIdentity"));
  claim("preview success must echo both path selectors",
    previewHandler.includes("result.branchId !== branchId")
    && previewHandler.includes("result.branchMenuItemId !== branchMenuItemId"));
  claim("preview parser accepts exactly the seven frozen fields",
    source.types.includes('["ok", "state", "branchMenuItemId", "branchId", "menuItemId", "soldOut", "soldOutVersion"]'));
  claim("preview projects no private or mutation-only field",
    !/actor|membershipId|price|nutrition|auditId|restaurant_internal/.test(
      bodyBetween(source.types, "export type RestaurantOwnerSoldOutPreview", "export type RestaurantOwnerSoldOutMutationRequest")));

  claim("POST body has exactly the three approved fields",
    source.types.includes('["expectedSoldOut", "nextSoldOut", "expectedVersion"]')
    && !/restaurantId|ownerId|userId|permission|price|availability/.test(
      bodyBetween(source.types, "export function parseMutationRequest", "const PREVIEW_ERRORS")));
  claim("the exact-body check cannot be short-circuited",
    !/(true\s*\|\||\|\|\s*true).*hasExactKeys|hasExactKeys[^\n]*(\|\|\s*true)/.test(source.types));
  claim("POST rejects null unknown and numeric versions through strict parsing",
    source.types.includes("typeof value !== \"string\"") && source.types.includes("hasExactKeys(value"));
  claim("POST enforces the bounded JSON body", mutationHandler.includes("RESTAURANT_OWNER_SOLD_OUT_BODY_LIMIT")
    && mutationHandler.includes("TextEncoder") && mutationHandler.includes('content-type'));
  claim("POST calls only the frozen P1 mutation RPC",
    source.types.includes(`"${P2_MUTATION_RPC}" as const`)
    && source.repository.includes("client.rpc(RESTAURANT_OWNER_SOLD_OUT_MUTATION_RPC")
    && mutationHandler.includes(".mutate(branchMenuItemId, input)")
    && !mutationHandler.includes(".preview("));
  claim("branch selector never becomes DB authority",
    mutationHandler.includes("branchId is deliberately not sent")
    && /mutate\(branchMenuItemId, input\)/.test(mutationHandler)
    && !/p_branch_id|p_restaurant_id/.test(repositoryMutation));
  claim("selected Restaurant context never grants POST authority",
    !/loadRestaurantAccessContext|SELECTED_RESTAURANT_COOKIE|access\.restaurant/.test(mutationHandler));
  claim("the repository exposes no generic RPC or caller-chosen operation",
    (source.repository.match(/client\.rpc\(/g) ?? []).length === 2
    && !/rpc\(name|functionName|rpcName/.test(source.repository));
  claim("there is no direct UPDATE or service role fallback",
    !/\.update\s*\(|service[_-]?role|SUPABASE_SERVICE/i.test(source.repository + source.runtime + source.component));
  claim("unknown DB preview vocabulary fails closed", source.repository.includes("parsePreviewResult(result.data) ?? { state: \"internal_failure\" }"));
  claim("unknown DB mutation vocabulary fails closed", source.repository.includes("parseMutationResult(result.data) ?? { state: \"internal_failure\" }"));
  claim("raw database errors never cross the route", !/result\.error\.(message|details|hint)|error\.message|stack|SQLERRM/i.test(source.runtime));

  claim("versions stay canonical decimal strings", source.types.includes("isDecimalVersion")
    && source.types.includes("value.length === MAX_BIGINT.length && value <= MAX_BIGINT"));
  claim("versions are never converted to JS numbers",
    !/(Number|parseInt|parseFloat)\s*\([^)]*(version|Version)|\+\s*[^;\n]*(version|Version)/.test(source.types + source.repository + source.runtime + source.component));
  claim("application code never increments a version",
    !/(soldOutVersion|expectedVersion)\s*(\+\+|\+=)|(?:soldOutVersion|expectedVersion)\s*\+\s*1/.test(source.types + source.repository + source.runtime + source.component));
  claim("stale state refreshes without automatic resubmission",
    submit.includes('result.state === "stale_state"') && submit.includes("await refresh()")
    && !/stale_state[\s\S]{0,240}(submit\(|fetch\([^)]*POST)/.test(submit));
  claim("uncertain transport reconciles through GET only",
    uncertain.includes("await refresh()") && !/method:\s*"POST"|submit\(/.test(uncertain));
  claim("uncertain reconciliation recognizes an already-applied state",
    uncertain.includes("current.soldOut === intendedState"));
  claim("a live failure can never fabricate a ready React state",
    !/catch\s*\{[\s\S]{0,240}state:\s*["']ready["']/.test(source.component));
  claim("no durable request id or blind retry is invented",
    !/requestId|randomUUID|retry.*POST|setTimeout\([^)]*submit/i.test(source.component + source.runtime + source.repository + source.types));

  claim("only a successful R1 preview enables the control",
    source.component.includes('if (preview.state !== "ready")')
    && source.component.includes("售完控制不可用") && source.component.includes("disabled"));
  claim("mock menu cannot render the live mutation component",
    source.views.includes("RestaurantOwnerSoldOutControl") && !source.menuPage.includes("RestaurantOwnerSoldOutControl")
    && !source.factory.includes("RestaurantOwnerSoldOutControl"));
  claim("the control requires an explicit confirmation",
    source.component.includes("confirmationOpen") && source.component.includes('role="alertdialog"')
    && source.component.includes("確認變更") && source.component.includes("取消")
    && source.component.includes("onClick={() => setConfirmationOpen(true)}"));
  claim("the control uses the approved Traditional Chinese actions",
    source.component.includes("標記售完") && source.component.includes("恢復供應"));
  claim("the confirmation explains public recommendation impact",
    source.component.includes("可供應餐點與推薦"));
  claim("the browser calls only the fixed same-origin API",
    source.component.includes("/api/restaurant/branches/")
    && !/supabase|restaurant_internal|sealed|write_authority|service[_-]?role/i.test(source.component));

  claim("responses are private no-store and vary on session cookie",
    source.runtime.includes('"Cache-Control": "private, no-store"') && source.runtime.includes('Vary: "Cookie"'));
  claim("the complete stable status mapping is present",
    ["401", "403", "404", "409", "422", "400", "503", "500"].every(code => source.runtime.includes(`: ${code}`)));
  claim("the acceptance harness targets only the approved hidden offering",
    source.harness.includes("P2_ACCEPTANCE_TARGET") && source.harness.includes("P2_ACCEPTANCE_RESTAURANT")
    && P2_FORBIDDEN_TARGETS.every(id => !source.harness.includes(id))
    && P2_FORBIDDEN_BRANCHES.every(id => !source.harness.includes(id)));
  claim("the acceptance harness recovers only through HTTP POST",
    !/update public\.branch_menu_items|delete from restaurant_internal|truncate/i.test(source.harness)
    && source.harness.includes('method: "POST"'));
  claim("the documentation preserves the P1 R1 and no-Production boundaries",
    /P1.*frozen|frozen.*P1/i.test(source.docs) && /R1.*preview/i.test(source.docs)
    && /No Production|Production remains untouched/i.test(source.docs));
  claim("no public demo target appears in any P2 application source",
    [...P2_FORBIDDEN_TARGETS, ...P2_FORBIDDEN_BRANCHES]
      .every(id => !(source.types + source.repository + source.runtime + source.route + source.component + source.views).includes(id)));
  return checks;
}

const MAX_BIGINT = "9223372036854775807";
export function modelVersion(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value)
    && (value.length < MAX_BIGINT.length || (value.length === MAX_BIGINT.length && value <= MAX_BIGINT));
}
export function modelRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["expectedSoldOut","expectedVersion","nextSoldOut"])) return false;
  return typeof value.expectedSoldOut === "boolean" && typeof value.nextSoldOut === "boolean" && modelVersion(value.expectedVersion);
}
export function modelUncertain(preview, intended) {
  return preview?.state === "ready" && preview.soldOut === intended ? "reconciled" : "explicit_retry_required";
}

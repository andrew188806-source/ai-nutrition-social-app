import "server-only";

import { createAdminSupabaseServerClient } from "../auth/supabase-server";

/**
 * ADMIN-B2 data access layer over the ADMIN-B1 read contracts. Every read goes through the signed-in staff
 * session (cookie session -> user JWT) to one of the nine `staff_admin_restaurant_*_v1` contracts; there is no
 * table access, no fallback and no mock data. The contract envelope is validated strictly: `forbidden`,
 * `invalid_request` and `not_found` stay distinct, and anything malformed is `unavailable` (never an empty result).
 */

export const RESTAURANT_LIST_PAGE_SIZE = 20;
export const RESTAURANT_LIST_MAX_PAGE = 500; // B1 rejects offsets above 10000 (500 pages of 20)

export type ReadFailure = Readonly<{ state: "forbidden" | "invalid_request" | "not_found" | "unavailable" }>;
export type ReadResult<T> = Readonly<{ state: "ready"; data: T }> | ReadFailure;

const CONTRACTS = Object.freeze({
  list: "staff_admin_restaurant_list_v1",
  detail: "staff_admin_restaurant_detail_v1",
  about: "staff_admin_restaurant_about_v1",
  contact: "staff_admin_restaurant_contact_v1",
  branchList: "staff_admin_restaurant_branch_list_v1",
  branchDetail: "staff_admin_restaurant_branch_detail_v1",
  branchContact: "staff_admin_restaurant_branch_contact_v1",
  branchHours: "staff_admin_restaurant_branch_hours_v1",
  branchGeo: "staff_admin_restaurant_branch_geo_v1"
} as const);
type ContractName = (typeof CONTRACTS)[keyof typeof CONTRACTS];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const int = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const numOrNull = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));
const list = (v: unknown): v is unknown[] => Array.isArray(v);

/** Identifier shape accepted by B1 (1-200 chars, no surrounding whitespace). Checked before any call. */
export function isValidReadId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 200 && value === value.trim();
}

async function call<T>(
  contract: ContractName,
  args: Readonly<Record<string, string | number | null>>,
  parse: (raw: Rec) => T | null
): Promise<ReadResult<T>> {
  let raw: unknown;
  try {
    const result = await createAdminSupabaseServerClient().rpc(contract, { ...args });
    if (result.error) return { state: "unavailable" };
    raw = result.data;
  } catch {
    return { state: "unavailable" };
  }
  if (!isRec(raw) || !str(raw.state)) return { state: "unavailable" };
  if (raw.state === "forbidden" || raw.state === "invalid_request" || raw.state === "not_found") {
    return Object.keys(raw).length === 1 ? { state: raw.state } : { state: "unavailable" };
  }
  if (raw.state !== "ready") return { state: "unavailable" };
  const data = parse(raw);
  return data === null ? { state: "unavailable" } : { state: "ready", data };
}

// ---------------------------------------------------------------------------------------------------------------
// Types (exactly the fields the B1 contracts return; nothing is added or defaulted from elsewhere)
// ---------------------------------------------------------------------------------------------------------------
export type RestaurantRow = Readonly<{
  restaurantId: string; name: string; city: string | null; category: string | null; status: string; createdAt: string;
  branchCount: number; activeMembershipCount: number; hasActiveOwner: boolean;
}>;
export type RestaurantListData = Readonly<{ items: readonly RestaurantRow[]; limit: number; offset: number; hasMore: boolean }>;
export type RestaurantDetailData = RestaurantRow & Readonly<{ activeBranchCount: number; menuCount: number; menuItemCount: number }>;
export type RestaurantAboutData = Readonly<{ restaurantId: string; name: string; about: string | null; aboutSource: string | null; aboutVersion: string | null }>;
export type RestaurantContactData = Readonly<{
  restaurantId: string; name: string; publicWebsiteUrl: string | null; publicWebsiteUrlVersion: string | null;
  socialLinks: readonly Readonly<{ provider: string; publicUrl: string | null }>[];
}>;
export type BranchRow = Readonly<{ branchId: string; restaurantId: string; name: string; district: string | null; status: string }>;
export type BranchListData = Readonly<{ restaurantId: string; items: readonly BranchRow[]; limit: number; offset: number; hasMore: boolean }>;
export type BranchDetailData = Readonly<{
  branchId: string; restaurantId: string; name: string; district: string | null; address: string | null; status: string;
  statusVersion: string; timezoneName: string | null; menuItemLinkCount: number;
}>;
export type BranchContactData = Readonly<{ branchId: string; restaurantId: string; name: string; publicPhone: string | null; publicPhoneVersion: string | null }>;
export type HoursInterval = Readonly<{ start: string; end: string; endDayOffset: number }>;
export type BranchHoursData = Readonly<{
  branchId: string; restaurantId: string; timezoneName: string | null; weeklyHoursConfigured: boolean;
  weekly: readonly (HoursInterval & Readonly<{ weekday: number }>)[];
  special: readonly Readonly<{ localDate: string; mode: string; intervals: readonly HoursInterval[] }>[];
  closures: readonly Readonly<{ startsAt: string; endsAt: string | null }>[];
}>;
export type BranchGeoData = Readonly<{
  branchId: string; restaurantId: string; address: string | null; latitude: number | null; longitude: number | null;
  geocodeStatus: string | null; geocodeProvider: string | null; geocodeResolvedAt: string | null; geocodeAttempts: number | null;
}>;

// ---------------------------------------------------------------------------------------------------------------
// Parsers (return null on any structural mismatch -> `unavailable`)
// ---------------------------------------------------------------------------------------------------------------
function parseRestaurantRow(r: unknown): RestaurantRow | null {
  if (!isRec(r) || !str(r.restaurantId) || !str(r.name) || !strOrNull(r.city) || !strOrNull(r.category) || !str(r.status) || !str(r.createdAt)
    || !int(r.branchCount) || !int(r.activeMembershipCount) || typeof r.hasActiveOwner !== "boolean") return null;
  return Object.freeze({ restaurantId: r.restaurantId, name: r.name, city: r.city, category: r.category, status: r.status, createdAt: r.createdAt,
    branchCount: r.branchCount, activeMembershipCount: r.activeMembershipCount, hasActiveOwner: r.hasActiveOwner });
}
function parseBranchRow(b: unknown): BranchRow | null {
  if (!isRec(b) || !str(b.branchId) || !str(b.restaurantId) || !str(b.name) || !strOrNull(b.district) || !str(b.status)) return null;
  return Object.freeze({ branchId: b.branchId, restaurantId: b.restaurantId, name: b.name, district: b.district, status: b.status });
}
function parsePage<T>(raw: Rec, row: (v: unknown) => T | null): { items: T[]; limit: number; offset: number; hasMore: boolean } | null {
  if (!list(raw.items) || !int(raw.limit) || !int(raw.offset) || typeof raw.hasMore !== "boolean" || raw.items.length > raw.limit) return null;
  const items: T[] = [];
  for (const item of raw.items) { const parsed = row(item); if (parsed === null) return null; items.push(parsed); }
  return { items, limit: raw.limit, offset: raw.offset, hasMore: raw.hasMore };
}
function parseInterval(i: unknown): HoursInterval | null {
  if (!isRec(i) || !str(i.start) || !str(i.end) || !int(i.endDayOffset)) return null;
  return Object.freeze({ start: i.start, end: i.end, endDayOffset: i.endDayOffset });
}

// ---------------------------------------------------------------------------------------------------------------
// Public reads: one function per B1 contract
// ---------------------------------------------------------------------------------------------------------------
export function readRestaurantList(page: number): Promise<ReadResult<RestaurantListData>> {
  if (!Number.isInteger(page) || page < 1 || page > RESTAURANT_LIST_MAX_PAGE) return Promise.resolve({ state: "invalid_request" });
  const offset = (page - 1) * RESTAURANT_LIST_PAGE_SIZE;
  return call(CONTRACTS.list, { p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset }, (raw) => {
    const parsed = parsePage(raw, parseRestaurantRow);
    return parsed && parsed.limit === RESTAURANT_LIST_PAGE_SIZE && parsed.offset === offset ? Object.freeze(parsed) : null;
  });
}

export function readRestaurantDetail(restaurantId: string): Promise<ReadResult<RestaurantDetailData>> {
  if (!isValidReadId(restaurantId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.detail, { p_restaurant_id: restaurantId }, (raw) => {
    const row = parseRestaurantRow(raw);
    if (!row || row.restaurantId !== restaurantId || !int(raw.activeBranchCount) || !int(raw.menuCount) || !int(raw.menuItemCount)) return null;
    return Object.freeze({ ...row, activeBranchCount: raw.activeBranchCount, menuCount: raw.menuCount, menuItemCount: raw.menuItemCount });
  });
}

export function readRestaurantAbout(restaurantId: string): Promise<ReadResult<RestaurantAboutData>> {
  if (!isValidReadId(restaurantId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.about, { p_restaurant_id: restaurantId }, (raw) => {
    if (raw.restaurantId !== restaurantId || !str(raw.name) || !strOrNull(raw.about) || !strOrNull(raw.aboutSource) || !strOrNull(raw.aboutVersion)) return null;
    return Object.freeze({ restaurantId, name: raw.name, about: raw.about, aboutSource: raw.aboutSource, aboutVersion: raw.aboutVersion });
  });
}

export function readRestaurantContact(restaurantId: string): Promise<ReadResult<RestaurantContactData>> {
  if (!isValidReadId(restaurantId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.contact, { p_restaurant_id: restaurantId }, (raw) => {
    if (raw.restaurantId !== restaurantId || !str(raw.name) || !strOrNull(raw.publicWebsiteUrl) || !strOrNull(raw.publicWebsiteUrlVersion) || !list(raw.socialLinks)) return null;
    const socialLinks: { provider: string; publicUrl: string | null }[] = [];
    for (const l of raw.socialLinks) { if (!isRec(l) || !str(l.provider) || !strOrNull(l.publicUrl)) return null; socialLinks.push({ provider: l.provider, publicUrl: l.publicUrl }); }
    return Object.freeze({ restaurantId, name: raw.name, publicWebsiteUrl: raw.publicWebsiteUrl, publicWebsiteUrlVersion: raw.publicWebsiteUrlVersion, socialLinks: Object.freeze(socialLinks) });
  });
}

export function readBranchList(restaurantId: string, page: number): Promise<ReadResult<BranchListData>> {
  if (!isValidReadId(restaurantId) || !Number.isInteger(page) || page < 1 || page > RESTAURANT_LIST_MAX_PAGE) return Promise.resolve({ state: "invalid_request" });
  const offset = (page - 1) * RESTAURANT_LIST_PAGE_SIZE;
  return call(CONTRACTS.branchList, { p_restaurant_id: restaurantId, p_limit: RESTAURANT_LIST_PAGE_SIZE, p_offset: offset }, (raw) => {
    const parsed = parsePage(raw, parseBranchRow);
    if (!parsed || raw.restaurantId !== restaurantId || parsed.limit !== RESTAURANT_LIST_PAGE_SIZE || parsed.offset !== offset
      || parsed.items.some((b) => b.restaurantId !== restaurantId)) return null;
    return Object.freeze({ restaurantId, ...parsed });
  });
}

export function readBranchDetail(restaurantId: string, branchId: string): Promise<ReadResult<BranchDetailData>> {
  if (!isValidReadId(restaurantId) || !isValidReadId(branchId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.branchDetail, { p_restaurant_id: restaurantId, p_branch_id: branchId }, (raw) => {
    if (raw.restaurantId !== restaurantId || raw.branchId !== branchId || !str(raw.name) || !strOrNull(raw.district) || !strOrNull(raw.address)
      || !str(raw.status) || !str(raw.statusVersion) || !strOrNull(raw.timezoneName) || !int(raw.menuItemLinkCount)) return null;
    return Object.freeze({ branchId, restaurantId, name: raw.name, district: raw.district, address: raw.address, status: raw.status,
      statusVersion: raw.statusVersion, timezoneName: raw.timezoneName, menuItemLinkCount: raw.menuItemLinkCount });
  });
}

export function readBranchContact(restaurantId: string, branchId: string): Promise<ReadResult<BranchContactData>> {
  if (!isValidReadId(restaurantId) || !isValidReadId(branchId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.branchContact, { p_restaurant_id: restaurantId, p_branch_id: branchId }, (raw) => {
    if (raw.restaurantId !== restaurantId || raw.branchId !== branchId || !str(raw.name) || !strOrNull(raw.publicPhone) || !strOrNull(raw.publicPhoneVersion)) return null;
    return Object.freeze({ branchId, restaurantId, name: raw.name, publicPhone: raw.publicPhone, publicPhoneVersion: raw.publicPhoneVersion });
  });
}

export function readBranchHours(restaurantId: string, branchId: string): Promise<ReadResult<BranchHoursData>> {
  if (!isValidReadId(restaurantId) || !isValidReadId(branchId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.branchHours, { p_restaurant_id: restaurantId, p_branch_id: branchId }, (raw) => {
    if (raw.restaurantId !== restaurantId || raw.branchId !== branchId || !strOrNull(raw.timezoneName) || typeof raw.weeklyHoursConfigured !== "boolean"
      || !list(raw.weekly) || !list(raw.special) || !list(raw.closures)) return null;
    const weekly: (HoursInterval & { weekday: number })[] = [];
    for (const w of raw.weekly) { const i = parseInterval(w); if (!i || !isRec(w) || !int(w.weekday)) return null; weekly.push({ ...i, weekday: w.weekday as number }); }
    const special: { localDate: string; mode: string; intervals: HoursInterval[] }[] = [];
    for (const s of raw.special) {
      if (!isRec(s) || !str(s.localDate) || !str(s.mode) || !list(s.intervals)) return null;
      const intervals: HoursInterval[] = [];
      for (const v of s.intervals) { const i = parseInterval(v); if (!i) return null; intervals.push(i); }
      special.push({ localDate: s.localDate, mode: s.mode, intervals });
    }
    const closures: { startsAt: string; endsAt: string | null }[] = [];
    for (const c of raw.closures) { if (!isRec(c) || !str(c.startsAt) || !strOrNull(c.endsAt)) return null; closures.push({ startsAt: c.startsAt, endsAt: c.endsAt }); }
    return Object.freeze({ branchId, restaurantId, timezoneName: raw.timezoneName, weeklyHoursConfigured: raw.weeklyHoursConfigured,
      weekly: Object.freeze(weekly), special: Object.freeze(special), closures: Object.freeze(closures) });
  });
}

export function readBranchGeo(restaurantId: string, branchId: string): Promise<ReadResult<BranchGeoData>> {
  if (!isValidReadId(restaurantId) || !isValidReadId(branchId)) return Promise.resolve({ state: "invalid_request" });
  return call(CONTRACTS.branchGeo, { p_restaurant_id: restaurantId, p_branch_id: branchId }, (raw) => {
    if (raw.restaurantId !== restaurantId || raw.branchId !== branchId || !strOrNull(raw.address) || !numOrNull(raw.latitude) || !numOrNull(raw.longitude)
      || !strOrNull(raw.geocodeStatus) || !strOrNull(raw.geocodeProvider) || !strOrNull(raw.geocodeResolvedAt)
      || !(raw.geocodeAttempts === null || int(raw.geocodeAttempts))) return null;
    return Object.freeze({ branchId, restaurantId, address: raw.address, latitude: raw.latitude, longitude: raw.longitude, geocodeStatus: raw.geocodeStatus,
      geocodeProvider: raw.geocodeProvider, geocodeResolvedAt: raw.geocodeResolvedAt, geocodeAttempts: raw.geocodeAttempts });
  });
}

import type { RestaurantAbout } from "./types";
import type { RestaurantAboutRow } from "./rowContract";

const LINE_FEED = String.fromCharCode(10);
function controlCodePoints(): number[] {
  const codes: number[] = [];
  for (let code = 0; code <= 31; code += 1) if (code !== 10) codes.push(code);
  for (let code = 127; code <= 159; code += 1) codes.push(code);
  return codes;
}
const FORBIDDEN_CONTROL = new RegExp(
  "[" + controlCodePoints().map((code) => String.fromCharCode(code)).join("") + "]"
);
const WHITESPACE_ONLY = new RegExp("^[ " + LINE_FEED + "]+$");

const string = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value) throw new Error(`Malformed restaurant about ${field}.`);
  return value;
};

function about(value: unknown): string {
  const result = string(value, "restaurant_about");
  if (FORBIDDEN_CONTROL.test(result)) throw new Error("Malformed restaurant about text.");
  if (WHITESPACE_ONLY.test(result)) throw new Error("Malformed restaurant about text.");
  const codePoints = [...result];
  if (codePoints.length < 1 || codePoints.length > 800) throw new Error("Malformed restaurant about text.");
  return result;
}

export function mapRestaurantAboutRows(
  rows: readonly RestaurantAboutRow[],
  expectedRestaurantId: string
): RestaurantAbout | null {
  if (rows.length === 0) return null;
  if (rows.length > 1) throw new Error("Restaurant about returned more than one row.");
  const row = rows[0];
  const restaurantId = string(row.restaurant_id, "restaurant_id");
  if (restaurantId !== expectedRestaurantId) throw new Error("Cross-restaurant about rejected.");
  return { restaurantId, about: about(row.restaurant_about) };
}

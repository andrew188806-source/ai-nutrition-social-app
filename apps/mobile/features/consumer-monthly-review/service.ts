import { parseMonthlyNutritionReview } from "./mapper";
import type { MonthlyNutritionReviewResult } from "./types";

export const MONTHLY_REVIEW_RPC = "get_current_user_monthly_nutrition_review";

export type MonthlyReviewRpcClient = {
  rpc(fn: string): PromiseLike<{ data: unknown; error: { code?: string | null; message?: string | null } | null }>;
};
export type MonthlyReviewSessionPort = {
  getCurrentSession(): Promise<{ ok: true; value: { user: { userId: string } } | null } | { ok: false }>;
};

/**
 * Reads the caller's own review. The owner is the server's auth.uid(): nothing about owner, plan, tier or clock is sent.
 * A failure is reported as unavailable; it is never replaced by demo or cached values.
 */
export class ConsumerMonthlyNutritionReviewService {
  constructor(private readonly options: { client: MonthlyReviewRpcClient; sessionPort: MonthlyReviewSessionPort }) {}

  async getCurrentUserMonthlyReview(): Promise<MonthlyNutritionReviewResult> {
    let session: Awaited<ReturnType<MonthlyReviewSessionPort["getCurrentSession"]>>;
    try {
      session = await this.options.sessionPort.getCurrentSession();
    } catch {
      return { status: "unavailable", reason: "transport" };
    }
    if (!session.ok) return { status: "unavailable", reason: "transport" };
    if (!session.value) return { status: "signInRequired" };
    let response: { data: unknown; error: { code?: string | null; message?: string | null } | null };
    try {
      response = await this.options.client.rpc(MONTHLY_REVIEW_RPC);
    } catch {
      return { status: "unavailable", reason: "transport" };
    }
    if (response.error) {
      const message = response.error.message ?? "";
      if (response.error.code === "28000" || message.includes("AUTHENTICATION_REQUIRED")) return { status: "signInRequired" };
      if (response.error.code === "42501" && message.includes("CORE_ACCESS_DENIED")) return { status: "coreDenied" };
      return { status: "unavailable", reason: "server" };
    }
    const review = parseMonthlyNutritionReview(response.data);
    return review ? { status: "ready", review } : { status: "unavailable", reason: "malformed" };
  }
}

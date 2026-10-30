// Default disabled. Live reads need BOTH an explicit source and an explicit opt-in; anything else is disabled (or misconfigured).
// The literal process.env member reads are kept so Expo can inline them.
export const MONTHLY_REVIEW_SOURCE_ENV = "EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE";
export const MONTHLY_REVIEW_OPT_IN_ENV = "EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN";

export type MonthlyReviewEnv = {
  EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE?: string;
  EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN?: string;
};

export type ConsumerMonthlyReviewFlags = { requested: "disabled" | "supabase-live"; liveReadOptIn: boolean; issues: string[] };

export function readMonthlyReviewEnv(): MonthlyReviewEnv {
  return {
    EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE,
    EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN: process.env.EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN
  };
}

export function parseConsumerMonthlyReviewFlags(env: MonthlyReviewEnv): ConsumerMonthlyReviewFlags {
  const issues: string[] = [];
  const source = env.EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_SOURCE?.trim();
  const optIn = env.EXPO_PUBLIC_TASTKIND_CONSUMER_MONTHLY_REVIEW_LIVE_READ_OPT_IN?.trim();
  let requested: ConsumerMonthlyReviewFlags["requested"] = "disabled";
  if (source === "supabase-live") requested = "supabase-live";
  else if (source !== undefined && source !== "" && source !== "disabled") issues.push(`Unknown ${MONTHLY_REVIEW_SOURCE_ENV}: ${source}`);
  if (optIn !== undefined && optIn !== "" && optIn !== "true" && optIn !== "false") issues.push(`${MONTHLY_REVIEW_OPT_IN_ENV} must be exactly true or false.`);
  const liveReadOptIn = optIn === "true";
  if (requested === "supabase-live" && !liveReadOptIn) issues.push(`Live monthly review reads require ${MONTHLY_REVIEW_OPT_IN_ENV}=true.`);
  if (liveReadOptIn && requested !== "supabase-live") issues.push(`${MONTHLY_REVIEW_OPT_IN_ENV} requires ${MONTHLY_REVIEW_SOURCE_ENV}=supabase-live.`);
  return { requested, liveReadOptIn, issues };
}

export function getConsumerMonthlyReviewFlags(): ConsumerMonthlyReviewFlags {
  return parseConsumerMonthlyReviewFlags(readMonthlyReviewEnv());
}

export async function analyzeMealPhotoPlaceholder() {
  // TODO: Replace with Supabase Edge Function that calls OpenAI for meal photo estimation.
  return { mode: "mock", calories: 620, proteinGrams: 38, carbsGrams: 58, fatGrams: 22 };
}

export async function requestPaymentPlaceholder() {
  // TODO: Replace with real subscription checkout provider.
  return { mode: "mock", status: "not_started" };
}

export async function requestAdReviewPlaceholder() {
  // TODO: Replace with ad review workflow and risky keyword detection.
  return { mode: "mock", status: "pending_review" };
}

export async function registerPushNotificationPlaceholder() {
  // TODO: Replace with Expo push notification registration.
  return { mode: "mock", status: "disabled" };
}

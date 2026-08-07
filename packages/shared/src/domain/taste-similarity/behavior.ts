import type {
  CanonicalMenuItemTargetReference,
  CanonicalRestaurantTargetReference,
  CanonicalTasteTargetReference,
  KnownOrUnknownValue,
  TasteEvidenceEnvelope,
  TasteEvidenceEnvelopeInput
} from "./evidence";

export type TasteEvidenceMealType = "breakfast" | "lunch" | "dinner" | "late_night" | "snack" | "other";

type MealEnvelope = TasteEvidenceEnvelope<"meal_record", "meal_record_item">;
type MealEnvelopeInput = TasteEvidenceEnvelopeInput<"meal_record", "meal_record_item">;

export type MealOccurrenceEvidence = {
  category: "behavior";
  behaviorKind: "meal_occurrence";
  interpretation: "observed";
  mealType: KnownOrUnknownValue<TasteEvidenceMealType>;
  occurredAt: string;
  consumedRatio: number;
  evidence: MealEnvelope;
};

export type MealOccurrenceEvidenceInput = Omit<MealOccurrenceEvidence, "mealType" | "evidence"> & {
  mealType: TasteEvidenceMealType | string | KnownOrUnknownValue<TasteEvidenceMealType>;
  evidence: MealEnvelopeInput;
};

type RestaurantFavoriteEnvelope = TasteEvidenceEnvelope<"favorite", "favorite_restaurant"> & {
  target: CanonicalRestaurantTargetReference;
};
type MenuItemFavoriteEnvelope = TasteEvidenceEnvelope<"favorite", "favorite_menu_item"> & {
  target: CanonicalMenuItemTargetReference;
};

export type FavoriteEvidence =
  | {
      category: "behavior";
      behaviorKind: "favorite";
      favoriteKind: "restaurant";
      interpretation: "positive_user_action";
      evidence: RestaurantFavoriteEnvelope;
    }
  | {
      category: "behavior";
      behaviorKind: "favorite";
      favoriteKind: "menu_item";
      interpretation: "positive_user_action";
      evidence: MenuItemFavoriteEnvelope;
    };

export type FavoriteEvidenceInput =
  | Omit<Extract<FavoriteEvidence, { favoriteKind: "restaurant" }>, "evidence"> & {
      evidence: TasteEvidenceEnvelopeInput<"favorite", "favorite_restaurant"> & {
        target: CanonicalRestaurantTargetReference;
      };
    }
  | Omit<Extract<FavoriteEvidence, { favoriteKind: "menu_item" }>, "evidence"> & {
      evidence: TasteEvidenceEnvelopeInput<"favorite", "favorite_menu_item"> & {
        target: CanonicalMenuItemTargetReference;
      };
    };

export type RatingFeedback = {
  taste?: string;
  portion?: string;
  price?: string;
  repurchase?: string;
  dislikeReasons: readonly string[];
};

type RatingEnvelope = TasteEvidenceEnvelope<"rating", "restaurant_rating" | "menu_item_rating"> & {
  target: CanonicalRestaurantTargetReference | CanonicalMenuItemTargetReference;
};

export type RatingEvidence = {
  category: "behavior";
  behaviorKind: "rating";
  ratingKind: "restaurant" | "menu_item";
  interpretation: "scalar_evaluation_unclassified";
  ratingValue: number;
  feedback: RatingFeedback;
  evidence: RatingEnvelope;
};

export type RatingEvidenceInput = Omit<RatingEvidence, "feedback" | "evidence"> & {
  feedback?: Partial<Omit<RatingFeedback, "dislikeReasons">> & { dislikeReasons?: readonly string[] };
  evidence: TasteEvidenceEnvelopeInput<"rating", "restaurant_rating" | "menu_item_rating"> & {
    target: CanonicalTasteTargetReference;
  };
};

export type BehavioralEvidence = MealOccurrenceEvidence | FavoriteEvidence | RatingEvidence;
export type BehavioralEvidenceInput = MealOccurrenceEvidenceInput | FavoriteEvidenceInput | RatingEvidenceInput;

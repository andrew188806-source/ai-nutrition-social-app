import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, ScanningBar, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { getPlannedDinnerEstimateOptions, type DinnerEstimate } from "../features/analysis/analysisMealRecordStore";
import { beginAnalysisCapture, resetAnalysisSession } from "../features/analysis";
import { type PlannedMeal } from "../features/planned-meal";
import { useConsumerRuntime, type ConsumerPlannedMealDraft } from "../features/consumer-runtime";

type ImageSource = "camera" | "gallery";
type PlannedDinnerType = (typeof zhTW.mobile.plannedDinnerHelper.mealTypes)[number];

const helperCopy = zhTW.mobile.plannedDinnerHelper;
const plannedDinnerTypes: readonly PlannedDinnerType[] = helperCopy.mealTypes;


export default function MealPhotoScreen() {
  const router = useRouter();
  const { autoOpen } = useLocalSearchParams<{ autoOpen?: string }>();
  const runtime = useConsumerRuntime();
  const actorTimezone = runtime.state.profileState.status === "available" ? runtime.state.profileState.profile.timezone : runtime.mode === "mock" ? "Asia/Taipei" : "";
  const [isSheetOpen, setIsSheetOpen] = useState(() => autoOpen === "true");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [plannedDinner, setPlannedDinner] = useState<PlannedMeal | null>(null);
  const [isDinnerFormOpen, setIsDinnerFormOpen] = useState(false);
  const [restaurantName, setRestaurantName] = useState(plannedDinner?.restaurantName ?? "");
  const [plannedType, setPlannedType] = useState<PlannedDinnerType>((plannedDinner?.mealType as PlannedDinnerType) || "火鍋");
  const [plannedTime, setPlannedTime] = useState(plannedDinner?.mealTime ?? "19:00");
  const [plannedDate] = useState(() => dateKeyInTimezone(new Date(), actorTimezone));
  const [meetingFriends, setMeetingFriends] = useState(plannedDinner?.isSocialMeal ?? false);
  const [notes, setNotes] = useState(plannedDinner?.notes ?? "");
  const [selectedDishName, setSelectedDishName] = useState(plannedDinner?.plannedMealName ?? "");

  const estimateOptions = useMemo(() => getDinnerOptions(plannedType, restaurantName), [plannedType, restaurantName]);
  const selectedEstimate = estimateOptions.find((option) => option.name === selectedDishName) ?? estimateOptions[0];
  const hasSpecificMockData = plannedType !== "其他" || restaurantName.trim().length > 0;

  function startAiAnalysis() {
    // Tapping "開始 AI 分析" is itself a new-session trigger, even before a source is chosen.
    resetAnalysisSession();
    setIsSheetOpen(true);
  }

  function openCamera() {
    // TODO: Connect camera image pipeline.
    startFakeAnalysis("camera");
  }

  function uploadFromGallery() {
    // TODO: Connect uploaded image preprocessing.
    startFakeAnalysis("gallery");
  }

  function startFakeAnalysis(nextSource: ImageSource) {
    // TODO: Replace fake demo analysis with real AI image analysis API.
    // A new photo means a new AI Analysis session: clear any previously completed analysis,
    // and record how this photo was obtained (camera vs. gallery) so analysis.tsx knows
    // whether to show the current/post-hoc confirmation (camera: never; gallery: always).
    beginAnalysisCapture(nextSource === "camera" ? "camera" : "gallery");
    setSource(nextSource);
    setIsSheetOpen(false);
    setIsAnalyzing(true);
  }

  function navigateToDemoResult() {
    // TODO: Replace static demo nutrition result with dynamic AI result.
    router.push("/analysis");
  }

  async function savePlannedDinnerDraft() {
    const nextPlan: PlannedMeal = {
      mealTime: plannedTime,
      plannedDate,
      plannedMealName: selectedEstimate.name,
      mealType: plannedType,
      restaurantName: restaurantName.trim() || helperCopy.defaultRestaurantName,
      calories: `${selectedEstimate.calories} kcal`,
      protein: `${selectedEstimate.protein}g`,
      carbs: `${selectedEstimate.carbs}g`,
      fat: `${selectedEstimate.fat}g`,
      notes: notes.trim(),
      isSocialMeal: meetingFriends
    };
    const result = await runtime.createPlannedMeal(toCanonicalDraft(nextPlan));
    if (result.status === "succeeded") {
      setPlannedDinner({ ...nextPlan, canonicalPlannedMealId: result.plannedMealId ?? undefined, canonicalStatus: "planned" });
      setSelectedDishName(nextPlan.plannedMealName);
      setIsDinnerFormOpen(false);
    }
  }

  function clearDinnerPlan() {
    setPlannedDinner(null);
    setRestaurantName("");
    setNotes("");
    setSelectedDishName("");
    setIsDinnerFormOpen(false);
  }

  useEffect(() => {
    if (!isAnalyzing) {
      return;
    }
    const timeout = setTimeout(navigateToDemoResult, 1400);
    return () => clearTimeout(timeout);
  }, [isAnalyzing]);

  useEffect(() => {
    // Home's "拍照分析" shortcut opens the sheet directly (autoOpen=true), which is the
    // same "start a new analysis" intent as tapping 開始 AI 分析 manually.
    if (autoOpen === "true") {
      resetAnalysisSession();
    }
  }, [autoOpen]);

  return (
    <PlaceholderScreen
      title={zhTW.mobile.refinedLogic.aiEntry.title}
      subtitle={zhTW.mobile.refinedLogic.aiEntry.body}
    >
      <Card tone="premium">
        <View style={styles.heroVisual}>
          <View style={styles.aiOrb}>
            <Text style={styles.aiOrbText}>AI</Text>
          </View>
          <View style={styles.sparkRow}>
            <View style={[styles.spark, styles.sparkGreen]} />
            <View style={[styles.spark, styles.sparkAmber]} />
            <View style={[styles.spark, styles.sparkCoral]} />
          </View>
        </View>
        <SectionTitle title={zhTW.mobile.refinedLogic.aiEntry.heroTitle} subtitle={zhTW.mobile.refinedLogic.aiEntry.heroBody} />
        <View style={styles.tagSpace}>
          <TagRow tags={zhTW.mobile.refinedLogic.lifestyleWorld.nutritionMoodTags} />
        </View>
      </Card>

      <Card>
        <SectionTitle title={zhTW.mobile.refinedLogic.aiEntry.actionTitle} subtitle={zhTW.mobile.analysisSubtitle} />
        <Pressable style={styles.mainAction} onPress={startAiAnalysis}>
          <Text style={styles.mainActionText}>{zhTW.mobile.refinedLogic.aiEntry.actionTitle}</Text>
        </Pressable>
        <Pressable style={styles.todayIntakeAction} onPress={() => router.push("/today-intake")}>
          <Text style={styles.todayIntakeActionText}>{zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.openButton}</Text>
        </Pressable>

        <PlannedDinnerHelper
          estimate={selectedEstimate}
          estimateOptions={estimateOptions}
          hasSpecificMockData={hasSpecificMockData}
          isFormOpen={isDinnerFormOpen}
          meetingFriends={meetingFriends}
          notes={notes}
          onClear={clearDinnerPlan}
          onMeetingFriendsChange={setMeetingFriends}
          onNotesChange={setNotes}
          onOpenForm={() => setIsDinnerFormOpen(true)}
          onRestaurantNameChange={setRestaurantName}
          onSave={() => { void savePlannedDinnerDraft(); }}
          onRetry={() => { void runtime.retryPendingPlannedMeal(); }}
          operationErrorCode={runtime.plannedMealState.errorCode}
          operationStatus={runtime.plannedMealState.status}
          onSelectedDishChange={setSelectedDishName}
          onTimeChange={setPlannedTime}
          onTypeChange={(type) => {
            setPlannedType(type);
            setSelectedDishName("");
          }}
          plannedDinner={plannedDinner}
          plannedTime={plannedTime}
          plannedType={plannedType}
          restaurantName={restaurantName}
          selectedDishName={selectedDishName}
        />
      </Card>

      {isAnalyzing ? (
        <Card tone="mint">
          <Text style={styles.sourceBadge}>{source === "camera" ? zhTW.mobile.refinedLogic.aiEntry.cameraTodo : zhTW.mobile.refinedLogic.aiEntry.uploadTodo}</Text>
          <SectionTitle title={zhTW.mobile.refinedLogic.aiEntry.loadingTitle} subtitle={zhTW.mobile.refinedLogic.aiEntry.loadingBody} />
          {source === "gallery" ? (
            <View style={styles.multiPhotoPanel}>
              <SectionTitle title={zhTW.mobile.refinedLogic.aiEntry.multiUploadTitle} subtitle={zhTW.mobile.refinedLogic.aiEntry.multiUploadBody} />
              <Text style={styles.photoCount}>{zhTW.mobile.refinedLogic.aiEntry.photoCountLabel}</Text>
              <TagRow tags={zhTW.mobile.refinedLogic.aiEntry.selectedPhotos} />
            </View>
          ) : null}
          <Text style={styles.loadingHint}>{zhTW.mobile.refinedLogic.aiEntry.loadingHint}</Text>
          <ScanningBar />
        </Card>
      ) : null}

      <ImageSourceSheet visible={isSheetOpen} onClose={() => setIsSheetOpen(false)} onCamera={openCamera} onUpload={uploadFromGallery} />
    </PlaceholderScreen>
  );
}

function PlannedDinnerHelper({
  estimate,
  estimateOptions,
  hasSpecificMockData,
  isFormOpen,
  meetingFriends,
  notes,
  onClear,
  onMeetingFriendsChange,
  onNotesChange,
  onOpenForm,
  onRestaurantNameChange,
  onSave,
  onRetry,
  operationErrorCode,
  operationStatus,
  onSelectedDishChange,
  onTimeChange,
  onTypeChange,
  plannedDinner,
  plannedTime,
  plannedType,
  restaurantName,
  selectedDishName
}: {
  estimate: DinnerEstimate;
  estimateOptions: DinnerEstimate[];
  hasSpecificMockData: boolean;
  isFormOpen: boolean;
  meetingFriends: boolean;
  notes: string;
  onClear: () => void;
  onMeetingFriendsChange: (value: boolean) => void;
  onNotesChange: (value: string) => void;
  onOpenForm: () => void;
  onRestaurantNameChange: (value: string) => void;
  onSave: () => void;
  onRetry: () => void;
  operationErrorCode: string | null;
  operationStatus: "idle" | "restoring" | "submitting" | "uncertain" | "succeeded" | "error";
  onSelectedDishChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onTypeChange: (value: PlannedDinnerType) => void;
  plannedDinner: PlannedMeal | null;
  plannedTime: string;
  plannedType: PlannedDinnerType;
  restaurantName: string;
  selectedDishName: string;
}) {
  if (plannedDinner && !isFormOpen) {
    return (
      <View style={styles.plannedHelper}>
        <View style={styles.helperHeader}>
          <Text style={styles.helperTitle}>{helperCopy.title}</Text>
          <Text style={styles.helperStatus}>{helperCopy.savedBadge}</Text>
        </View>
        <Text style={styles.helperSummary}>
          {helperCopy.summaryLabel} {plannedDinner.mealTime}｜{plannedDinner.mealType}｜{plannedDinner.isSocialMeal ? helperCopy.socialYes : helperCopy.socialNo}
        </Text>
        <Text style={styles.helperMeta}>
          {plannedDinner.restaurantName}｜{plannedDinner.plannedMealName}
        </Text>
        <Text style={styles.helperEstimate}>
          {helperCopy.estimatedNutrition}：{plannedDinner.calories}｜{zhTW.mobile.analysis.protein} {plannedDinner.protein}｜{zhTW.mobile.analysis.carbs} {plannedDinner.carbs}｜{zhTW.mobile.analysis.fat} {plannedDinner.fat}
        </Text>
        <Text style={styles.helperGuidance}>{getLunchGuidance(plannedDinner.mealType)}</Text>
        <View style={styles.helperActions}>
          <Pressable style={styles.helperSecondaryButton} onPress={onOpenForm}>
            <Text style={styles.helperSecondaryText}>{helperCopy.editButton}</Text>
          </Pressable>
          <Pressable style={styles.helperGhostButton} onPress={onClear}>
            <Text style={styles.helperGhostText}>{helperCopy.clearButton}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.plannedHelper}>
      <View style={styles.helperHeader}>
        <Text style={styles.helperTitle}>{helperCopy.title}</Text>
        <Text style={styles.helperStatus}>{helperCopy.badge}</Text>
      </View>
      <Text style={styles.helperSubtitle}>{helperCopy.subtitle}</Text>
      {operationStatus === "uncertain" ? (
        <View>
          <Text style={styles.helperMeta}>{zhTW.mobile.plannedDinner.uncertainMessage}</Text>
          <Pressable style={styles.helperSecondaryButton} onPress={onRetry}><Text style={styles.helperSecondaryText}>{zhTW.mobile.plannedDinner.retryCta}</Text></Pressable>
        </View>
      ) : operationErrorCode ? <Text style={styles.helperMeta}>{operationErrorCode === "conflict" ? zhTW.mobile.plannedDinner.conflictMessage : zhTW.mobile.plannedDinner.errorMessage}</Text> : null}
      {!isFormOpen ? (
        <Pressable style={styles.helperPrimaryButton} onPress={onOpenForm}>
          <Text style={styles.helperPrimaryText}>{helperCopy.button}</Text>
        </Pressable>
      ) : (
        <View style={styles.formPanel}>
          <Text style={styles.inputLabel}>{helperCopy.restaurantName}</Text>
          <TextInput value={restaurantName} onChangeText={onRestaurantNameChange} placeholder={helperCopy.restaurantPlaceholder} placeholderTextColor={colors.muted} style={styles.textInput} />

          <Text style={styles.inputLabel}>{helperCopy.mealType}</Text>
          <View style={styles.optionRow}>
            {plannedDinnerTypes.map((type) => (
              <Pressable key={type} style={[styles.typeChip, plannedType === type && styles.typeChipActive]} onPress={() => onTypeChange(type)}>
                <Text style={[styles.typeChipText, plannedType === type && styles.typeChipTextActive]}>{type}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>{helperCopy.plannedTime}</Text>
          <View style={styles.optionRow}>
            {helperCopy.timeOptions.map((time) => (
              <Pressable key={time} style={[styles.typeChip, plannedTime === time && styles.typeChipActive]} onPress={() => onTimeChange(time)}>
                <Text style={[styles.typeChipText, plannedTime === time && styles.typeChipTextActive]}>{time}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>{helperCopy.meetingFriends}</Text>
          <View style={styles.optionRow}>
            {[true, false].map((value) => (
              <Pressable key={String(value)} style={[styles.typeChip, meetingFriends === value && styles.typeChipActive]} onPress={() => onMeetingFriendsChange(value)}>
                <Text style={[styles.typeChipText, meetingFriends === value && styles.typeChipTextActive]}>{value ? helperCopy.yes : helperCopy.no}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>{helperCopy.possibleDishes}</Text>
          <Text style={styles.helperMeta}>{hasSpecificMockData ? helperCopy.estimatedFromSimilar : helperCopy.roughEstimate}</Text>
          <View style={styles.optionColumn}>
            {estimateOptions.slice(0, 3).map((option) => (
              <Pressable key={option.name} style={[styles.dishOption, (selectedDishName || estimateOptions[0].name) === option.name && styles.dishOptionActive]} onPress={() => onSelectedDishChange(option.name)}>
                <Text style={styles.dishName}>{option.name}</Text>
                <Text style={styles.dishMeta}>
                  {option.calories} kcal｜蛋白質 {option.protein}g｜碳水 {option.carbs}g｜脂肪 {option.fat}g
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.inputLabel}>{helperCopy.notes}</Text>
          <TextInput value={notes} onChangeText={onNotesChange} placeholder={helperCopy.notesPlaceholder} placeholderTextColor={colors.muted} style={[styles.textInput, styles.noteInput]} multiline />

          <View style={styles.estimateBox}>
            <Text style={styles.helperEstimate}>
              {helperCopy.estimatedNutrition}：{estimate.calories} kcal｜{zhTW.mobile.analysis.protein} {estimate.protein}g｜{zhTW.mobile.analysis.carbs} {estimate.carbs}g｜{zhTW.mobile.analysis.fat} {estimate.fat}g
            </Text>
            <Text style={styles.helperGuidance}>{getLunchGuidance(plannedType)}</Text>
          </View>

          <Pressable disabled={operationStatus === "submitting"} style={styles.helperPrimaryButton} onPress={onSave}>
            <Text style={styles.helperPrimaryText}>{helperCopy.saveButton}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function getDinnerOptions(type: PlannedDinnerType, restaurantName: string) {
  return getPlannedDinnerEstimateOptions(type, restaurantName);
}

function toCanonicalDraft(plan: PlannedMeal): ConsumerPlannedMealDraft {
  return {
    plannedFor: plan.plannedDate ?? "",
    plannedLocalTime: /^\d{2}:\d{2}$/.test(plan.mealTime) ? plan.mealTime : null,
    mealType: "dinner",
    mealCategory: plan.mealType.trim() || null,
    title: plan.plannedMealName.trim(),
    restaurantNameSnapshot: plan.restaurantName.trim() || null,
    note: plan.notes.trim() || null,
    restaurantId: null,
    branchId: null,
    menuItemId: null,
    nutritionSnapshot: {
      calories: parseNutrition(plan.calories),
      protein: parseNutrition(plan.protein),
      carbohydrates: parseNutrition(plan.carbs),
      fat: parseNutrition(plan.fat)
    }
  };
}

function parseNutrition(value: string) {
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function dateKeyInTimezone(value: Date, timezone: string) {
  if (!timezone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    const values = new Map(parts.map((part) => [part.type, part.value])); return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
  } catch { return ""; }
}

function getLunchGuidance(type: string) {
  if (type === "火鍋") return helperCopy.lunchGuidanceHotPot;
  if (type === "牛排" || type === "燒肉") return helperCopy.lunchGuidanceHeavy;
  if (type === "義大利麵" || type === "壽司") return helperCopy.lunchGuidanceCarb;
  return helperCopy.lunchGuidanceDefault;
}

function ImageSourceSheet({ visible, onClose, onCamera, onUpload }: { visible: boolean; onClose: () => void; onCamera: () => void; onUpload: () => void }) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <SectionTitle title={zhTW.mobile.refinedLogic.aiEntry.sheetTitle} subtitle={zhTW.mobile.refinedLogic.aiEntry.sheetBody} />
          <Pressable style={styles.sheetButton} onPress={onCamera}>
            <Text style={styles.sheetButtonText}>{zhTW.mobile.refinedLogic.aiEntry.cameraOption}</Text>
          </Pressable>
          <Pressable style={[styles.sheetButton, styles.uploadButton]} onPress={onUpload}>
            <Text style={styles.sheetButtonText}>{zhTW.mobile.refinedLogic.aiEntry.uploadOption}</Text>
          </Pressable>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>{zhTW.common.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  aiOrb: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    backgroundColor: colors.teal,
    height: 72,
    shadowColor: "#2d6b52",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    width: 72
  },
  aiOrbText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900"
  },
  closeButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  closeButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  dishMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  dishName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  dishOption: {
    gap: 3,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 10
  },
  dishOptionActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  estimateBox: {
    gap: 5,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 10
  },
  formPanel: {
    gap: 10
  },
  helperActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  helperEstimate: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 18
  },
  helperGhostButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.cream,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  helperGhostText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  helperGuidance: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 18
  },
  helperHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10
  },
  helperMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18
  },
  helperPrimaryButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  helperPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  helperSecondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  helperSecondaryText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  helperStatus: {
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  helperSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  helperSummary: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20
  },
  helperTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  heroVisual: {
    alignItems: "center",
    gap: 12,
    marginBottom: 18
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  loadingHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18,
    marginVertical: 14
  },
  mainAction: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 15
  },
  mainActionText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900"
  },
  multiPhotoPanel: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.card,
    marginTop: 14,
    padding: 14
  },
  noteInput: {
    minHeight: 64,
    textAlignVertical: "top"
  },
  optionColumn: {
    gap: 8
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  photoCount: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  plannedHelper: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    marginTop: 12,
    padding: 12
  },
  sheet: {
    gap: 12,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: colors.paper,
    padding: 22,
    shadowColor: "#2d2823",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -10 }
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(32,26,20,0.42)"
  },
  sheetButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  sheetButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  sheetHandle: {
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: colors.line,
    height: 5,
    marginBottom: 8,
    width: 44
  },
  slotChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  slotChipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  slotChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  slotChipTextActive: {
    color: colors.ink
  },
  slotPanel: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    marginTop: 14,
    padding: 12
  },
  slotRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  sourceBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  spark: {
    borderRadius: 999,
    height: 10,
    width: 10
  },
  sparkAmber: {
    backgroundColor: colors.amber
  },
  sparkCoral: {
    backgroundColor: colors.coral
  },
  sparkGreen: {
    backgroundColor: "#8AAE97"
  },
  sparkRow: {
    flexDirection: "row",
    gap: 8
  },
  tagSpace: {
    marginTop: 14
  },
  textInput: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  todayIntakeAction: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 13
  },
  todayIntakeActionText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  typeChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  typeChipActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  typeChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  typeChipTextActive: {
    color: colors.ink
  },
  uploadButton: {
    backgroundColor: colors.teal
  }
});

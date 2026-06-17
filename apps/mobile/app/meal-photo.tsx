import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, ScanningBar, SectionTitle, TagRow, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { clearPlannedDinner, getPlannedDinner, savePlannedDinner, type PlannedMeal } from "../features/planned-meal";

type ImageSource = "camera" | "gallery";
type DinnerEstimate = { name: string; calories: number; protein: number; carbs: number; fat: number };
type PlannedDinnerType = (typeof zhTW.mobile.plannedDinnerHelper.mealTypes)[number];

const helperCopy = zhTW.mobile.plannedDinnerHelper;
const plannedDinnerTypes: readonly PlannedDinnerType[] = helperCopy.mealTypes;

const mockDinnerOptions: Record<PlannedDinnerType, DinnerEstimate[]> = {
  火鍋: [
    { name: "清湯火鍋", calories: 640, protein: 42, carbs: 54, fat: 24 },
    { name: "麻辣火鍋", calories: 860, protein: 38, carbs: 62, fat: 42 },
    { name: "海鮮火鍋", calories: 700, protein: 48, carbs: 50, fat: 28 }
  ],
  牛排: [
    { name: "沙朗牛排", calories: 760, protein: 52, carbs: 38, fat: 36 },
    { name: "雞腿排", calories: 620, protein: 46, carbs: 42, fat: 24 },
    { name: "漢堡排", calories: 820, protein: 40, carbs: 58, fat: 38 }
  ],
  壽司: [
    { name: "鮭魚壽司組", calories: 620, protein: 34, carbs: 82, fat: 18 },
    { name: "散壽司", calories: 700, protein: 38, carbs: 88, fat: 20 },
    { name: "清爽壽司組", calories: 540, protein: 30, carbs: 72, fat: 14 }
  ],
  燒肉: [
    { name: "綜合燒肉盤", calories: 920, protein: 52, carbs: 46, fat: 52 },
    { name: "雞肉燒肉", calories: 720, protein: 48, carbs: 44, fat: 34 },
    { name: "牛肉燒肉", calories: 880, protein: 56, carbs: 40, fat: 48 }
  ],
  義大利麵: [
    { name: "番茄雞肉義大利麵", calories: 680, protein: 34, carbs: 88, fat: 20 },
    { name: "奶油義大利麵", calories: 820, protein: 28, carbs: 92, fat: 36 },
    { name: "海鮮義大利麵", calories: 720, protein: 36, carbs: 86, fat: 24 }
  ],
  便當: [
    { name: "烤雞便當", calories: 620, protein: 42, carbs: 72, fat: 18 },
    { name: "鮭魚便當", calories: 680, protein: 38, carbs: 76, fat: 24 },
    { name: "均衡便當", calories: 650, protein: 34, carbs: 78, fat: 20 }
  ],
  其他: [{ name: "一般晚餐估算", calories: 700, protein: 32, carbs: 74, fat: 26 }]
};

export default function MealPhotoScreen() {
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mealSlot, setMealSlot] = useState<string>(zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions[1]);
  const [source, setSource] = useState<ImageSource | null>(null);
  const [plannedDinner, setPlannedDinner] = useState<PlannedMeal | null>(() => getPlannedDinner());
  const [isDinnerFormOpen, setIsDinnerFormOpen] = useState(false);
  const [restaurantName, setRestaurantName] = useState(plannedDinner?.restaurantName ?? "");
  const [plannedType, setPlannedType] = useState<PlannedDinnerType>((plannedDinner?.mealType as PlannedDinnerType) || "火鍋");
  const [plannedTime, setPlannedTime] = useState(plannedDinner?.mealTime ?? "19:00");
  const [meetingFriends, setMeetingFriends] = useState(plannedDinner?.isSocialMeal ?? false);
  const [notes, setNotes] = useState(plannedDinner?.notes ?? "");
  const [selectedDishName, setSelectedDishName] = useState(plannedDinner?.plannedMealName ?? "");

  const estimateOptions = useMemo(() => getDinnerOptions(plannedType, restaurantName), [plannedType, restaurantName]);
  const selectedEstimate = estimateOptions.find((option) => option.name === selectedDishName) ?? estimateOptions[0];
  const hasSpecificMockData = plannedType !== "其他" || restaurantName.trim().length > 0;

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
    setSource(nextSource);
    setIsSheetOpen(false);
    setIsAnalyzing(true);
  }

  function navigateToDemoResult() {
    // TODO: Replace static demo nutrition result with dynamic AI result.
    router.push({ pathname: "/analysis", params: { mealSlot } });
  }

  function savePlannedDinnerDraft() {
    const nextPlan: PlannedMeal = {
      mealTime: plannedTime,
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
    savePlannedDinner(nextPlan);
    setPlannedDinner(nextPlan);
    setSelectedDishName(nextPlan.plannedMealName);
    setIsDinnerFormOpen(false);
  }

  function clearDinnerPlan() {
    clearPlannedDinner();
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
  }, [isAnalyzing, mealSlot]);

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
        <View style={styles.slotPanel}>
          <SectionTitle title={zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotTitle} />
          <View style={styles.slotRow}>
            {zhTW.mobile.refinedLogic.lifestyleWorld.todayIntake.mealSlotOptions.map((slot) => (
              <Pressable key={slot} style={[styles.slotChip, mealSlot === slot && styles.slotChipActive]} onPress={() => setMealSlot(slot)}>
                <Text style={[styles.slotChipText, mealSlot === slot && styles.slotChipTextActive]}>{slot}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={styles.mainAction} onPress={() => setIsSheetOpen(true)}>
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
          onSave={savePlannedDinnerDraft}
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

          <Pressable style={styles.helperPrimaryButton} onPress={onSave}>
            <Text style={styles.helperPrimaryText}>{helperCopy.saveButton}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function getDinnerOptions(type: PlannedDinnerType, restaurantName: string) {
  const normalizedName = restaurantName.trim();
  if (normalizedName.includes("鍋")) return mockDinnerOptions.火鍋;
  if (normalizedName.includes("牛") || normalizedName.includes("排")) return mockDinnerOptions.牛排;
  if (normalizedName.includes("壽司") || normalizedName.includes("日式")) return mockDinnerOptions.壽司;
  if (normalizedName.includes("燒肉") || normalizedName.includes("烤肉")) return mockDinnerOptions.燒肉;
  if (normalizedName.includes("義") || normalizedName.includes("麵")) return mockDinnerOptions.義大利麵;
  if (normalizedName.includes("便當")) return mockDinnerOptions.便當;
  return mockDinnerOptions[type];
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

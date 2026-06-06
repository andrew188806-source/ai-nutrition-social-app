import { Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, SectionTitle, TagRow, colors } from "../../components/DemoUi";
import type { DailyNutritionRecord, NutritionMemoryRecord } from "./types";

type SectionProps = {
  expandedId: string | null;
  items: readonly NutritionMemoryRecord[];
  onToggle: (id: string) => void;
};

export function NutritionDataSection({ expandedId, items, onToggle }: SectionProps) {
  return (
    <Card tone="sky">
      <SectionTitle title={zhTW.mobile.nutritionMemory.nutritionDataTitle} subtitle={zhTW.mobile.nutritionMemory.nutritionDataBody} />
      <View style={styles.cardList}>
        {items.map((item) => (
          <NutritionDataCard key={item.id} expanded={expandedId === item.id} item={item} onToggle={() => onToggle(item.id)} />
        ))}
      </View>
    </Card>
  );
}

export function NutritionRecordHome({
  expandedId,
  items,
  savedDayIds,
  onSaveDay,
  onToggle
}: {
  expandedId: string | null;
  items: readonly DailyNutritionRecord[];
  savedDayIds: readonly string[];
  onSaveDay: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <Card tone="sky">
      <SectionTitle title={zhTW.mobile.refinedLogic.nutritionRecord.title} subtitle={zhTW.mobile.refinedLogic.nutritionRecord.body} />
      <Text style={styles.memoryNote}>{zhTW.mobile.refinedLogic.nutritionRecord.retentionBody}</Text>
      <View style={styles.cardList}>
        {items.map((item) => (
          <DailyNutritionCard key={item.id} expanded={expandedId === item.id} isSaved={savedDayIds.includes(item.id) || item.isFavorited} item={item} onSave={() => onSaveDay(item.id)} onToggle={() => onToggle(item.id)} />
        ))}
      </View>
      <View style={styles.detailPanel}>
        <Text style={styles.detailTitle}>{zhTW.mobile.refinedLogic.nutritionRecord.monthlyReportTitle}</Text>
        <Text style={styles.detailValue}>{zhTW.mobile.refinedLogic.nutritionRecord.freeSavedLimit}</Text>
        <Text style={styles.detailValue}>{zhTW.mobile.refinedLogic.nutritionRecord.premiumSavedLimit}</Text>
      </View>
    </Card>
  );
}

export function FoodMemorySection({ expandedId, items, onToggle }: SectionProps) {
  const filterOptions = [zhTW.mobile.refinedLogic.foodMemory.byDate, zhTW.mobile.refinedLogic.foodMemory.byCount, zhTW.mobile.refinedLogic.foodMemory.byRating, zhTW.mobile.refinedLogic.foodMemory.byRegion];
  return (
    <Card tone="mint">
      <SectionTitle title={zhTW.mobile.nutritionMemory.foodMemoryDataTitle} subtitle={zhTW.mobile.nutritionMemory.foodMemoryDataBody} />
      <View style={styles.filterRow}>
        {filterOptions.map((option) => (
          <Text key={option} style={styles.filterPill}>{option}</Text>
        ))}
      </View>
      <Text style={styles.memoryNote}>{zhTW.mobile.refinedLogic.foodMemory.retentionBody}</Text>
      <Text style={styles.memoryNote}>{zhTW.mobile.refinedLogic.foodMemory.indexRule}</Text>
      <View style={styles.cardList}>
        {items.map((item) => (
          <FoodMemoryCard key={item.id} expanded={expandedId === item.id} item={item} onToggle={() => onToggle(item.id)} />
        ))}
      </View>
      <View style={styles.detailPanel}>
        <Text style={styles.detailTitle}>{zhTW.mobile.refinedLogic.foodMemory.favoriteLimitTitle}</Text>
        <Text style={styles.detailValue}>{zhTW.mobile.refinedLogic.foodMemory.freeFavoriteLimit}</Text>
        <Text style={styles.detailValue}>{zhTW.mobile.refinedLogic.foodMemory.premiumFavoriteLimit}</Text>
      </View>
    </Card>
  );
}

function DailyNutritionCard({ expanded, isSaved, item, onSave, onToggle }: { expanded: boolean; isSaved: boolean; item: DailyNutritionRecord; onSave: () => void; onToggle: () => void }) {
  return (
    <View style={[styles.dataCard, expanded && styles.expandedCard]}>
      <Pressable onPress={onToggle}>
        <Text style={styles.mealName}>{item.id === "today" ? zhTW.mobile.refinedLogic.nutritionRecord.todayTitle : item.date}</Text>
        <Text style={styles.metaText}>{item.meals.join(" / ")}</Text>
      </Pressable>
      <View style={styles.macroRow}>
        <View style={styles.macroBox}><Text style={styles.macroLabel}>{zhTW.mobile.nutritionMemory.detailLabels.calories}</Text><Text style={styles.macroValue}>{item.totalCalories}</Text></View>
        <View style={styles.macroBox}><Text style={styles.macroLabel}>{zhTW.mobile.nutritionMemory.detailLabels.protein}</Text><Text style={styles.macroValue}>{item.totalProtein}</Text></View>
        <View style={styles.macroBox}><Text style={styles.macroLabel}>{zhTW.mobile.nutritionMemory.detailLabels.carbs}</Text><Text style={styles.macroValue}>{item.totalCarbs}</Text></View>
        <View style={styles.macroBox}><Text style={styles.macroLabel}>{zhTW.mobile.nutritionMemory.detailLabels.fat}</Text><Text style={styles.macroValue}>{item.totalFat}</Text></View>
      </View>
      <View style={styles.actionRow}>
        <Pressable style={styles.linkButton} onPress={onToggle}>
          <Text style={styles.linkText}>{expanded ? zhTW.mobile.nutritionMemory.hideDetails : zhTW.mobile.refinedLogic.nutritionRecord.viewDay}</Text>
        </Pressable>
        <Pressable style={styles.linkButton} onPress={onSave}>
          <Text style={styles.linkText}>{isSaved ? zhTW.mobile.refinedLogic.nutritionRecord.savedDay : zhTW.mobile.refinedLogic.nutritionRecord.saveDay}</Text>
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.detailPanel}>
          <DetailLine label={zhTW.mobile.refinedLogic.nutritionRecord.todayMealsTitle} value={item.meals.join(" / ")} />
          <DetailLine label={zhTW.mobile.refinedLogic.nutritionRecord.dateRecordsTitle} value={item.date} />
          <DetailLine label={zhTW.mobile.nutritionMemory.detailLabels.mealType} value={item.mealCount} />
        </View>
      ) : null}
    </View>
  );
}

function NutritionDataCard({ expanded, item, onToggle }: { expanded: boolean; item: NutritionMemoryRecord; onToggle: () => void }) {
  return (
    <Pressable style={[styles.dataCard, expanded && styles.expandedCard]} onPress={onToggle}>
      <RecordHeader icon="N" item={item} />
      <MacroRow item={item} />
      {item.healthGoal ? <Text style={styles.goalNote}>{item.healthGoal}</Text> : null}
      <Text style={styles.detailLink}>{expanded ? zhTW.mobile.nutritionMemory.hideDetails : zhTW.mobile.nutritionMemory.viewDetails}</Text>
      {expanded ? <NutritionDetailView item={item} /> : null}
    </Pressable>
  );
}

function FoodMemoryCard({ expanded, item, onToggle }: { expanded: boolean; item: NutritionMemoryRecord; onToggle: () => void }) {
  return (
    <Pressable style={[styles.dataCard, expanded && styles.expandedCard]} onPress={onToggle}>
      <View style={styles.photoBox}>
        <Text style={styles.iconText}>{zhTW.mobile.refinedLogic.foodMemory.analysisPhoto}</Text>
      </View>
      <RecordHeader icon="FM" item={item} />
      <Text style={styles.memoryNote}>{item.preferenceNote}</Text>
      <TagRow tags={[getSourceLabel(item.sourceType), item.mealType, item.repeatedCount ?? zhTW.mobile.nutritionMemory.savedFoodMemory]} />
      <Text style={styles.detailLink}>{expanded ? zhTW.mobile.nutritionMemory.hideDetails : zhTW.mobile.nutritionMemory.viewDetails}</Text>
      {expanded ? <FoodMemoryDetailView item={item} /> : null}
      <View style={styles.actionRow}>
        <Text style={styles.detailLink}>{zhTW.mobile.refinedLogic.foodMemory.favorite}</Text>
        <Text style={styles.detailLink}>{zhTW.mobile.refinedLogic.foodMemory.expandMore}</Text>
      </View>
    </Pressable>
  );
}

function RecordHeader({ icon, item }: { icon: string; item: NutritionMemoryRecord }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.headerText}>
        <Text style={styles.mealName}>{item.mealName}</Text>
        <Text style={styles.metaText}>
          {item.mealType} | {item.recordedAt} | {getSourceLabel(item.sourceType)}
        </Text>
      </View>
    </View>
  );
}

function MacroRow({ item }: { item: NutritionMemoryRecord }) {
  const labels = zhTW.mobile.nutritionMemory.detailLabels;
  const macros = [
    { label: labels.calories, value: item.calories },
    { label: labels.protein, value: item.protein },
    { label: labels.carbs, value: item.carbs },
    { label: labels.fat, value: item.fat }
  ];

  return (
    <View style={styles.macroRow}>
      {macros.map((macro) => (
        <View key={macro.label} style={styles.macroBox}>
          <Text style={styles.macroLabel}>{macro.label}</Text>
          <Text style={styles.macroValue}>{macro.value}</Text>
        </View>
      ))}
    </View>
  );
}

function NutritionDetailView({ item }: { item: NutritionMemoryRecord }) {
  const labels = zhTW.mobile.nutritionMemory.detailLabels;

  return (
    <View style={styles.detailPanel}>
      <Text style={styles.detailTitle}>{zhTW.mobile.nutritionMemory.nutritionAnalysis}</Text>
      <DetailLine label={labels.mealName} value={item.mealName} />
      <DetailLine label={labels.mealType} value={item.mealType} />
      {item.restaurantName ? <DetailLine label={labels.restaurantName} value={item.restaurantName} /> : null}
      <DetailLine label={labels.ingredients} value={item.ingredients.join(" / ")} />
      <DetailLine label={labels.portion} value={item.portion} />
      <DetailLine label={labels.cookingMethod} value={item.cookingMethod} />
      <DetailLine label={labels.notes} value={item.notes} />
      <DetailLine label={labels.sourceType} value={getSourceLabel(item.sourceType)} />
      <DetailLine label={labels.recordedAt} value={item.recordedAt} />
    </View>
  );
}

function FoodMemoryDetailView({ item }: { item: NutritionMemoryRecord }) {
  const labels = zhTW.mobile.nutritionMemory.detailLabels;

  return (
    <View style={styles.detailPanel}>
      <Text style={styles.detailTitle}>{zhTW.mobile.nutritionMemory.mealRecord}</Text>
      {item.restaurantName ? <DetailLine label={labels.restaurantName} value={item.restaurantName} /> : null}
      <DetailLine label={labels.ingredients} value={item.ingredients.join(" / ")} />
      <DetailLine label={labels.portion} value={item.portion} />
      <DetailLine label={labels.cookingMethod} value={item.cookingMethod} />
      <DetailLine label={labels.repeatedCount} value={item.repeatedCount ?? "-"} />
      <DetailLine label={labels.correctionNote} value={item.correctionNote ?? "-"} />
      <DetailLine label={labels.preferenceNote} value={item.preferenceNote ?? "-"} />
      <DetailLine label={labels.notes} value={item.notes} />
      <DetailLine label={labels.sourceType} value={getSourceLabel(item.sourceType)} />
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getSourceLabel(sourceType: NutritionMemoryRecord["sourceType"]) {
  return zhTW.mobile.nutritionMemory.sourceTypes[sourceType];
}

const styles = StyleSheet.create({
  cardList: {
    gap: 12,
    marginTop: 14
  },
  dataCard: {
    gap: 12,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 14
  },
  expandedCard: {
    borderColor: colors.teal,
    backgroundColor: "#fffdf8"
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  iconCircle: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.ink,
    height: 48,
    width: 48
  },
  iconText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  mealName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  metaText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  macroRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  macroBox: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#fffaf0",
    flexGrow: 1,
    flexBasis: 92,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  macroLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  macroValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 3
  },
  goalNote: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19
  },
  memoryNote: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  detailLink: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  linkText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  linkButton: {
    alignSelf: "flex-start",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.mint,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  filterPill: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  photoBox: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.sky,
    minHeight: 70
  },
  detailPanel: {
    gap: 9,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 12
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  detailLine: {
    gap: 3
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  detailValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  }
});

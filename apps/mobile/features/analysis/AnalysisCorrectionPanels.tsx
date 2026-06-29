import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { colors, SectionTitle } from "../../components/DemoUi";
import { getCorrectionMockValue } from "./analysisCorrectionData";
import type { CorrectionSection, CorrectionSectionKey, NutritionSummary } from "./types";

type CorrectionPanelControls = {
  addSection: CorrectionSectionKey | null;
  confirmAddedSection: (sectionKey: CorrectionSectionKey) => void;
  confirmCorrectionRow: (rowKey: string) => void;
  correctedRows: Record<string, boolean>;
  completeCorrection: () => void;
  expandedCorrection: string | null;
  toggleAddSection: (sectionKey: CorrectionSectionKey) => void;
  toggleCorrectionRow: (rowKey: string) => void;
};

type CorrectionBreakdownControls = Omit<CorrectionPanelControls, "completeCorrection">;

export function EstimatePreview({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <View style={styles.estimateBlock}>
      <SectionTitle title={title} />
      {items.map((item) => (
        <Text key={item} style={styles.reasonItem}>
          {item}
        </Text>
      ))}
    </View>
  );
}

export function ExternalCorrectionPanel({
  addSection,
  confirmAddedSection,
  confirmCorrectionRow,
  correctedRows,
  correctionSections,
  completeCorrection,
  expandedCorrection,
  mealName,
  nutritionSummary,
  nutritionRefreshed,
  restaurantName,
  setMealName,
  setRestaurantName,
  toggleAddSection,
  toggleCorrectionRow
}: CorrectionPanelControls & {
  correctionSections: CorrectionSection[];
  mealName: string;
  nutritionRefreshed: boolean;
  nutritionSummary: NutritionSummary;
  restaurantName: string;
  setMealName: (value: string) => void;
  setRestaurantName: (value: string) => void;
}) {
  return (
    <View style={styles.correctionList}>
      <SectionTitle title={zhTW.mobile.finalUx.externalAiBreakdownTitle} subtitle={zhTW.mobile.finalUx.aiCostControlHint} />
      <MealLevelForm nutritionRefreshed={nutritionRefreshed} nutritionSummary={nutritionSummary} restaurantName={restaurantName} setRestaurantName={setRestaurantName} mealName={mealName} setMealName={setMealName} />
      <CorrectionBreakdownSections addSection={addSection} confirmAddedSection={confirmAddedSection} confirmCorrectionRow={confirmCorrectionRow} correctedRows={correctedRows} correctionSections={correctionSections} expandedCorrection={expandedCorrection} toggleAddSection={toggleAddSection} toggleCorrectionRow={toggleCorrectionRow} />
      <CompleteCorrectionButton onPress={completeCorrection} />
    </View>
  );
}

export function SelfCookedCorrectionPanel({
  addSection,
  confirmAddedSection,
  confirmCorrectionRow,
  correctedRows,
  correctionCompleted,
  correctionSections,
  completeCorrection,
  expandedCorrection,
  nutritionRefreshed,
  nutritionSummary,
  renderSuccessActions,
  toggleAddSection,
  toggleCorrectionRow
}: CorrectionPanelControls & {
  correctionCompleted: boolean;
  correctionSections: CorrectionSection[];
  nutritionRefreshed: boolean;
  nutritionSummary: NutritionSummary;
  renderSuccessActions: () => ReactNode;
}) {
  return (
    <View style={styles.correctionList}>
      <CorrectionBreakdownSections addSection={addSection} confirmAddedSection={confirmAddedSection} confirmCorrectionRow={confirmCorrectionRow} correctedRows={correctedRows} correctionSections={correctionSections} expandedCorrection={expandedCorrection} toggleAddSection={toggleAddSection} toggleCorrectionRow={toggleCorrectionRow} />
      <View style={styles.correctionSection}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>{zhTW.mobile.finalUx.cookingNameTitle}</Text>
        </View>
        <Text style={styles.inlineField}>{zhTW.mobile.finalUx.cookingNameTitle}</Text>
        <Text style={styles.inlineField}>{zhTW.mobile.finalUx.cookingNoteTitle}</Text>
      </View>
      <View style={styles.correctionSection}>
        <SectionTitle title={zhTW.mobile.finalUx.selfCookedDataFlowTitle} subtitle={zhTW.mobile.finalUx.selfCookedDataFlowBody} />
      </View>
      <NutritionSummaryPreview nutritionSummary={nutritionSummary} />
      {nutritionRefreshed ? <Text style={styles.stateText}>{zhTW.mobile.finalUx.refreshedNutrition}</Text> : null}
      <CompleteCorrectionButton onPress={completeCorrection} />
      {correctionCompleted ? renderSuccessActions() : null}
    </View>
  );
}

export function CorrectionSuccessActions({ hasRestaurantContext, onOpenMealLog, onOpenSocial }: { hasRestaurantContext: boolean; onOpenMealLog: () => void; onOpenSocial: () => void }) {
  return (
    <View style={styles.successPanel}>
      <Text style={styles.successText}>{zhTW.mobile.finalUx.correctionSuccess}</Text>
      <Text style={styles.successText}>{hasRestaurantContext ? zhTW.mobile.finalUx.dataFlywheelBody : zhTW.mobile.finalUx.selfCookedDataFlowBody}</Text>
      <View style={styles.actionGrid}>
        {hasRestaurantContext ? (
          <Pressable style={styles.actionButton} onPress={onOpenSocial}>
            <Text style={styles.actionButtonText}>{zhTW.mobile.refinedLogic.analysisFlow.goMealPartners}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.actionButton} onPress={onOpenMealLog}>
          <Text style={styles.actionButtonText}>{zhTW.mobile.refinedLogic.analysisFlow.saveMealRecord}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function CorrectionBreakdownSections({
  addSection,
  confirmAddedSection,
  confirmCorrectionRow,
  correctedRows,
  correctionSections,
  expandedCorrection,
  toggleAddSection,
  toggleCorrectionRow
}: CorrectionBreakdownControls & { correctionSections: CorrectionSection[] }) {
  return (
    <>
      {correctionSections.map((section) => (
        <View key={section.key} style={styles.correctionSection}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Pressable style={styles.inlineButton} onPress={() => toggleAddSection(section.key)}>
              <Text style={styles.inlineButtonText}>{zhTW.mobile.finalUx.addItem}</Text>
            </Pressable>
          </View>

          {section.items.map((item) => {
            const rowKey = `${section.key}-${item}`;
            const isExpanded = expandedCorrection === rowKey;

            return (
              <View key={rowKey} style={[styles.correctionRow, isExpanded && styles.correctionRowExpanded]}>
                <View style={styles.correctionRowTop}>
                  <Text style={styles.correctionText}>
                    {item}
                    {correctedRows[rowKey] ? ` - ${zhTW.mobile.finalUx.rowUpdatedLabel}` : ""}
                  </Text>
                  <Pressable style={styles.inlineButton} onPress={() => toggleCorrectionRow(rowKey)}>
                    <Text style={styles.inlineButtonText}>{zhTW.mobile.finalUx.editIngredient}</Text>
                  </Pressable>
                </View>
                {isExpanded ? <InlineEditFields fields={section.fields} item={item} onConfirm={() => confirmCorrectionRow(rowKey)} /> : null}
              </View>
            );
          })}

          {addSection === section.key ? (
            <View style={styles.addPanelCompact}>
              <InlineEditFields fields={section.fields} item={zhTW.mobile.finalUx.addedIngredient.name} onConfirm={() => confirmAddedSection(section.key)} confirmLabel={zhTW.mobile.finalUx.addIngredientConfirm} />
            </View>
          ) : null}
        </View>
      ))}
    </>
  );
}

function InlineEditFields({ confirmLabel = zhTW.mobile.finalUx.confirmIngredient, fields, item, onConfirm }: { confirmLabel?: string; fields: readonly string[]; item: string; onConfirm: () => void }) {
  return (
    <View style={styles.inlineEditCompact}>
      {fields.map((field, fieldIndex) => (
        <View key={field} style={styles.compactField}>
          <Text style={styles.compactFieldLabel}>{field}</Text>
          <Text style={styles.compactFieldValue}>{getCorrectionMockValue(fieldIndex, item)}</Text>
        </View>
      ))}
      <Pressable style={styles.confirmInlineButton} onPress={onConfirm}>
        <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

function MealLevelForm({
  nutritionSummary,
  nutritionRefreshed,
  restaurantName,
  setRestaurantName,
  mealName,
  setMealName
}: {
  nutritionSummary: NutritionSummary;
  nutritionRefreshed: boolean;
  restaurantName: string;
  setRestaurantName: (value: string) => void;
  mealName: string;
  setMealName: (value: string) => void;
}) {
  const displayValues = [
    restaurantName,
    mealName,
    nutritionSummary.ingredientSummary,
    nutritionSummary.portion,
    zhTW.mobile.analysis.estimatedCooking.join("、"),
    `${nutritionSummary.calories} kcal`,
    `${nutritionSummary.protein}g`,
    `${nutritionSummary.carbohydrates}g`,
    `${nutritionSummary.fat}g`,
    zhTW.mobile.finalUx.mealRecordUpdatedValues[9] ?? ""
  ];

  return (
    <View style={styles.mealRecordForm}>
      <SectionTitle title={zhTW.mobile.finalUx.mealRecordFormTitle} subtitle={zhTW.mobile.finalUx.mealRecordFormBody} />
      <View style={styles.mealRecordGrid}>
        {zhTW.mobile.finalUx.mealRecordFields.map((field, index) => (
          <View key={field} style={[styles.mealRecordField, index < 2 && styles.mealRecordEditableField]}>
            <Text style={styles.compactFieldLabel}>{field}</Text>
            {index === 0 ? (
              <TextInput value={restaurantName} onChangeText={setRestaurantName} style={styles.mealRecordInput} />
            ) : index === 1 ? (
              <TextInput value={mealName} onChangeText={setMealName} style={styles.mealRecordInput} />
            ) : (
              <Text style={styles.compactFieldValue}>{displayValues[index]}</Text>
            )}
            {index < 2 ? <Text style={styles.editableHint}>{zhTW.mobile.finalUx.manuallyControlledHint}</Text> : null}
          </View>
        ))}
      </View>
      <NutritionSummaryPreview nutritionSummary={nutritionSummary} />
      {nutritionRefreshed ? <Text style={styles.stateText}>{zhTW.mobile.finalUx.mealRecordAutoUpdated}</Text> : null}
    </View>
  );
}

function NutritionSummaryPreview({ nutritionSummary }: { nutritionSummary: NutritionSummary }) {
  return (
    <View style={styles.nutritionSummaryPanel}>
      <Text style={styles.summaryPreviewTitle}>{zhTW.mobile.analysis.summary}</Text>
      <View style={styles.summaryPreviewGrid}>
        <Text style={styles.summaryPreviewItem}>{zhTW.mobile.analysis.calories}: {nutritionSummary.calories} kcal</Text>
        <Text style={styles.summaryPreviewItem}>{zhTW.mobile.analysis.protein}: {nutritionSummary.protein}g</Text>
        <Text style={styles.summaryPreviewItem}>{zhTW.mobile.analysis.carbs}: {nutritionSummary.carbohydrates}g</Text>
        <Text style={styles.summaryPreviewItem}>{zhTW.mobile.analysis.fat}: {nutritionSummary.fat}g</Text>
        <Text style={styles.summaryPreviewItem}>{zhTW.mobile.finalUx.mealRecordFields[3]}: {nutritionSummary.portion}</Text>
      </View>
    </View>
  );
}

function CompleteCorrectionButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.completeButton} onPress={onPress}>
      <Text style={styles.completeButtonText}>{zhTW.mobile.finalUx.completeRecalculate}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  actionButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  actionGrid: {
    gap: 8
  },
  addPanelCompact: {
    gap: 10,
    borderColor: "#f4c56f",
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#fff7df",
    padding: 10
  },
  compactField: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    minWidth: 118,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  compactFieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  compactFieldValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3
  },
  completeButton: {
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: colors.ink,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  confirmButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  confirmInlineButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 14,
    backgroundColor: colors.teal,
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  correctionList: {
    gap: 14,
    marginTop: 14
  },
  correctionRow: {
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 12
  },
  correctionRowExpanded: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  correctionRowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  correctionSection: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#fffdf8",
    padding: 12
  },
  correctionText: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "900"
  },
  editableHint: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  estimateBlock: {
    gap: 8,
    marginTop: 14
  },
  inlineButton: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  inlineButtonText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  inlineEditCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  inlineField: {
    borderColor: colors.line,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.muted,
    flexGrow: 1,
    fontSize: 13,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  mealRecordEditableField: {
    borderColor: colors.teal
  },
  mealRecordField: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    minWidth: 132,
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  mealRecordForm: {
    gap: 12,
    borderColor: colors.teal,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.mint,
    padding: 12
  },
  mealRecordGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  mealRecordInput: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 3,
    minWidth: 0,
    padding: 0
  },
  nutritionSummaryPanel: {
    gap: 8,
    borderColor: "#d9eadf",
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 12
  },
  summaryPreviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  summaryPreviewItem: {
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  summaryPreviewTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  reasonItem: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  sectionRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  sectionTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "900"
  },
  stateText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  successPanel: {
    gap: 12,
    borderColor: colors.teal,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.mint,
    padding: 14
  },
  successText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20
  }
});

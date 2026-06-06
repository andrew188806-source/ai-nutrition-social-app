import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, PremiumBadge, SectionTitle, TagRow, colors } from "../../components/DemoUi";
import { getAvatarDisplayLabel } from "./avatarDisplayPolicy";
import type { CommunityCardSettingsState, PreviewMode, SystemMascot, VisibilityLevel } from "./types";

export function ProfileMenuItem({ body, onPress, title }: { body: string; onPress: () => void; title: string }) {
  return (
    <Pressable style={styles.menuItem} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Text style={styles.menuIconText}>CC</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuBody}>{body}</Text>
      </View>
      <Text style={styles.menuArrow}>{">"}</Text>
    </Pressable>
  );
}

export function TagSelector({ selectedTags, tags, title, onToggle }: { selectedTags: readonly string[]; tags: readonly string[]; title: string; onToggle: (tag: string) => void }) {
  return (
    <Card>
      <SectionTitle title={title} />
      <View style={styles.tagWrap}>
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <Pressable key={tag} style={[styles.tagButton, selected && styles.tagButtonActive]} onPress={() => onToggle(tag)}>
              <Text style={[styles.tagButtonText, selected && styles.tagButtonTextActive]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export function DiningPreferenceSettings({
  settings,
  onToggle,
  onSelect
}: {
  settings: CommunityCardSettingsState;
  onToggle: (group: "avoidedFoods" | "dietTypes", tag: string) => void;
  onSelect: (field: "spicePreference" | "gatheringStyle" | "paymentPreference" | "areaVisibility" | "calorieGoalVisibility", value: string) => void;
}) {
  return (
    <Card tone="amber">
      <SectionTitle title={zhTW.mobile.communityCardSettings.diningPreferenceTitle} subtitle={zhTW.mobile.communityCardSettings.openFromProfileBody} />
      <PreferenceTagGroup title={zhTW.mobile.communityCardSettings.avoidedFoodsTitle} tags={zhTW.mobile.communityCardSettings.avoidedFoodsOptions} selectedTags={settings.avoidedFoods} onToggle={(tag) => onToggle("avoidedFoods", tag)} />
      <PreferenceTagGroup title={zhTW.mobile.communityCardSettings.dietTypeTitle} tags={zhTW.mobile.communityCardSettings.dietTypeOptions} selectedTags={settings.dietTypes} onToggle={(tag) => onToggle("dietTypes", tag)} />
      <PreferenceOptionGroup title={zhTW.mobile.communityCardSettings.spicePreferenceTitle} options={zhTW.mobile.communityCardSettings.spicePreferenceOptions} selected={settings.spicePreference} onSelect={(value) => onSelect("spicePreference", value)} />
      <PreferenceOptionGroup title={zhTW.mobile.communityCardSettings.gatheringStyleTitle} options={zhTW.mobile.communityCardSettings.gatheringStyleOptions} selected={settings.gatheringStyle} onSelect={(value) => onSelect("gatheringStyle", value)} />
      <PreferenceOptionGroup title={zhTW.mobile.communityCardSettings.paymentPreferenceTitle} options={zhTW.mobile.communityCardSettings.paymentPreferenceOptions} selected={settings.paymentPreference} onSelect={(value) => onSelect("paymentPreference", value)} />
      <PreferenceOptionGroup title={zhTW.mobile.communityCardSettings.areaVisibilityTitle} options={zhTW.mobile.communityCardSettings.areaVisibilityOptions} selected={settings.areaVisibility} onSelect={(value) => onSelect("areaVisibility", value)} />
      <PreferenceOptionGroup title={zhTW.mobile.communityCardSettings.calorieGoalVisibilityTitle} options={zhTW.mobile.communityCardSettings.calorieGoalVisibilityOptions} selected={settings.calorieGoalVisibility} onSelect={(value) => onSelect("calorieGoalVisibility", value)} />
    </Card>
  );
}

function PreferenceTagGroup({ selectedTags, tags, title, onToggle }: { selectedTags: readonly string[]; tags: readonly string[]; title: string; onToggle: (tag: string) => void }) {
  return (
    <View style={styles.preferenceGroup}>
      <Text style={styles.inputLabel}>{title}</Text>
      <View style={styles.tagWrap}>
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <Pressable key={tag} style={[styles.tagButton, selected && styles.tagButtonActive]} onPress={() => onToggle(tag)}>
              <Text style={[styles.tagButtonText, selected && styles.tagButtonTextActive]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PreferenceOptionGroup({ options, selected, title, onSelect }: { options: readonly string[]; selected: string; title: string; onSelect: (value: string) => void }) {
  return (
    <View style={styles.preferenceGroup}>
      <Text style={styles.inputLabel}>{title}</Text>
      <View style={styles.visibilityOptions}>
        {options.map((option) => (
          <Pressable key={option} style={[styles.visibilityOption, selected === option && styles.visibilityOptionActive]} onPress={() => onSelect(option)}>
            <Text style={[styles.visibilityOptionText, selected === option && styles.visibilityOptionTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SystemAvatarSelector({ mascots, selectedId, onSelect }: { mascots: readonly SystemMascot[]; selectedId: string; onSelect: (id: string) => void }) {
  return (
    <Card tone="mint">
      <SectionTitle title={zhTW.mobile.communityCardSettings.mascotTitle} subtitle={zhTW.mobile.communityCardSettings.mascotBody} />
      <View style={styles.mascotGrid}>
        {mascots.map((mascot) => {
          const selected = selectedId === mascot.id;
          return (
            <Pressable key={mascot.id} style={[styles.mascotCard, selected && styles.mascotCardActive]} onPress={() => onSelect(mascot.id)}>
              <View style={styles.mascotAvatar}>
                <Text style={styles.mascotAvatarText}>{mascot.assetKey}</Text>
              </View>
              <Text style={styles.mascotName}>{mascot.name}</Text>
              <Text style={styles.mascotDescription}>{mascot.description}</Text>
              <TagRow tags={mascot.tags.slice(0, 3)} />
              <Text style={styles.selectText}>{zhTW.mobile.communityCardSettings.useMascot}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export function AvatarUploader({ hasUploadedPhoto, onUpload }: { hasUploadedPhoto: boolean; onUpload: () => void }) {
  return (
    <Card tone="amber">
      <SectionTitle title={zhTW.mobile.communityCardSettings.uploadTitle} subtitle={zhTW.mobile.communityCardSettings.uploadBody} />
      <View style={styles.uploadRow}>
        <View style={[styles.uploadPreview, hasUploadedPhoto && styles.uploadPreviewActive]}>
          <Text style={styles.uploadPreviewText}>{hasUploadedPhoto ? "IMG" : "ID"}</Text>
        </View>
        <View style={styles.flex}>
          <Pressable style={styles.primaryButton} onPress={onUpload}>
            <Text style={styles.primaryButtonText}>{zhTW.mobile.communityCardSettings.uploadCta}</Text>
          </Pressable>
          {hasUploadedPhoto ? <Text style={styles.stateText}>{zhTW.mobile.communityCardSettings.uploadedState}</Text> : <Text style={styles.stateText}>{zhTW.mobile.communityCardSettings.freeHint}</Text>}
        </View>
      </View>
    </Card>
  );
}

export function FieldVisibilityControl({ fieldId, label, selected, onChange }: { fieldId: string; label: string; selected: VisibilityLevel; onChange: (fieldId: string, level: VisibilityLevel) => void }) {
  return (
    <View style={styles.visibilityField}>
      <Text style={styles.visibilityTitle}>{label}</Text>
      <Text style={styles.visibilityQuestion}>{zhTW.mobile.communityCardSettings.visibilityQuestion}</Text>
      {fieldId === "avatar" ? (
        <>
          <Text style={styles.visibilityQuestion}>{zhTW.mobile.refinedLogic.avatar.publicAvatarHelp}</Text>
          <Text style={styles.visibilityQuestion}>{zhTW.mobile.refinedLogic.avatar.privateAvatarHelp}</Text>
        </>
      ) : null}
      <View style={styles.visibilityOptions}>
        {zhTW.mobile.communityCardSettings.visibilityLevels.map((level) => (
          <Pressable key={level.id} style={[styles.visibilityOption, selected === level.id && styles.visibilityOptionActive]} onPress={() => onChange(fieldId, level.id as VisibilityLevel)}>
            <Text style={[styles.visibilityOptionText, selected === level.id && styles.visibilityOptionTextActive]}>{level.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function CommunityPrivacySettings({ settings, onChange }: { settings: CommunityCardSettingsState; onChange: (fieldId: string, level: VisibilityLevel) => void }) {
  return (
    <Card tone="sky">
      <SectionTitle title={zhTW.mobile.communityCardSettings.privacyTitle} subtitle={zhTW.mobile.communityCardSettings.privacyBody} />
      <View style={styles.visibilityList}>
        {zhTW.mobile.communityCardSettings.privacyFields.map((field) => (
          <FieldVisibilityControl key={field.id} fieldId={field.id} label={field.label} selected={settings.fieldVisibility[field.id] ?? "public"} onChange={onChange} />
        ))}
      </View>
    </Card>
  );
}

export function CommunityCardPreviewModeToggle({ mode, onChange }: { mode: PreviewMode; onChange: (mode: PreviewMode) => void }) {
  const modes: PreviewMode[] = ["free", "premium", "owner"];

  return (
    <View style={styles.previewModeRow}>
      {modes.map((item, index) => (
        <Pressable key={item} style={[styles.previewModeButton, mode === item && styles.previewModeButtonActive]} onPress={() => onChange(item)}>
          <Text style={[styles.previewModeText, mode === item && styles.previewModeTextActive]}>{zhTW.mobile.communityCardSettings.previewModes[index]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function CommunityCardPreview({ mascot, mode, settings }: { mascot: SystemMascot; mode: PreviewMode; settings: CommunityCardSettingsState }) {
  const canSee = (fieldId: string) => isVisible(settings.fieldVisibility[fieldId] ?? "public", mode);
  const avatarLabel = getAvatarDisplayLabel({ context: mode === "owner" ? "owner" : mode === "free" ? "free" : "normal", mascot, settings });

  return (
    <Card tone="premium">
      <PremiumBadge label={mode === "free" ? zhTW.mobile.premiumUi.freeBadge : mode === "premium" ? zhTW.mobile.premiumUi.premiumBadge : zhTW.mobile.communityCardSettings.previewModes[2]} variant={mode === "free" ? "free" : "premium"} />
      <SectionTitle title={zhTW.mobile.communityCardSettings.previewTitle} subtitle={zhTW.mobile.communityCardSettings.previewBody} />
      <View style={styles.previewCard}>
        <View style={styles.previewAvatar}>
          <Text style={styles.previewAvatarText}>{canSee("avatar") ? avatarLabel : mascot.assetKey}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.previewName}>{canSee("nickname") ? settings.nickname : mascot.name}</Text>
          <Text style={styles.previewMeta}>{mascot.personalityType}</Text>
          {canSee("intro") ? <Text style={styles.previewIntro}>{settings.intro}</Text> : <Text style={styles.previewIntro}>{zhTW.mobile.communityCardSettings.photoHiddenHint}</Text>}
        </View>
      </View>
      {canSee("eatingTags") ? <TagRow tags={settings.selectedEatingTags} /> : null}
      {canSee("healthTags") ? <TagRow tags={settings.selectedHealthTags} /> : null}
      {canSee("socialTags") ? <TagRow tags={settings.selectedBuddyTags} /> : null}
      <TagRow tags={[settings.gatheringStyle, settings.paymentPreference, ...settings.dietTypes.slice(0, 2)]} />
    </Card>
  );
}

export function ProfileTextFields({
  age,
  gender,
  intro,
  nickname,
  onAgeChange,
  onGenderChange,
  onIntroChange,
  onNicknameChange
}: {
  age: string;
  gender: string;
  intro: string;
  nickname: string;
  onAgeChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  onIntroChange: (value: string) => void;
  onNicknameChange: (value: string) => void;
}) {
  return (
    <Card>
      <SectionTitle title={zhTW.mobile.communityCardSettings.profileSectionTitle} />
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{zhTW.mobile.communityCardSettings.nicknameLabel}</Text>
        <TextInput value={nickname} onChangeText={onNicknameChange} style={styles.input} />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{zhTW.mobile.communityCardSettings.introLabel}</Text>
        <TextInput maxLength={100} multiline value={intro} onChangeText={onIntroChange} style={[styles.input, styles.textArea]} />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{zhTW.mobile.communityCardSettings.genderLabel}</Text>
        <View style={styles.visibilityOptions}>
          {zhTW.mobile.communityCardSettings.genderOptions.map((option) => (
            <Pressable key={option} style={[styles.visibilityOption, gender === option && styles.visibilityOptionActive]} onPress={() => onGenderChange(option)}>
              <Text style={[styles.visibilityOptionText, gender === option && styles.visibilityOptionTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{zhTW.mobile.communityCardSettings.ageLabel}</Text>
        <TextInput value={age} onChangeText={onAgeChange} style={styles.input} />
      </View>
    </Card>
  );
}

function isVisible(level: VisibilityLevel, mode: PreviewMode) {
  if (mode === "owner") return level !== "hidden";
  if (level === "hidden" || level === "private") return false;
  if (level === "premiumOnly") return mode === "premium";
  return true;
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 6
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    padding: 14
  },
  menuIcon: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    height: 44,
    width: 44
  },
  menuIconText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  menuTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  menuBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  menuArrow: {
    color: colors.teal,
    fontSize: 20,
    fontWeight: "900"
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  preferenceGroup: {
    gap: 10,
    marginTop: 16
  },
  tagButton: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  tagButtonActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  tagButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  tagButtonTextActive: {
    color: colors.ink
  },
  mascotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  mascotCard: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    flexBasis: 145,
    padding: 12
  },
  mascotCardActive: {
    borderColor: colors.teal,
    backgroundColor: "#fffdf8"
  },
  mascotAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.ink,
    height: 52,
    width: 52
  },
  mascotAvatarText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900"
  },
  mascotName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  mascotDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  selectText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  uploadRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginTop: 14
  },
  uploadPreview: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    height: 70,
    width: 70
  },
  uploadPreviewActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  uploadPreviewText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.teal,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  stateText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  visibilityList: {
    gap: 12,
    marginTop: 14
  },
  visibilityField: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 12
  },
  visibilityTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  visibilityQuestion: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  visibilityOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  visibilityOption: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  visibilityOptionActive: {
    borderColor: "#f4c56f",
    backgroundColor: "#fff3d9"
  },
  visibilityOptionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  visibilityOptionTextActive: {
    color: colors.ink
  },
  previewModeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  previewModeButton: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  previewModeButtonActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  previewModeText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  previewModeTextActive: {
    color: colors.ink
  },
  previewCard: {
    flexDirection: "row",
    gap: 14,
    marginTop: 14
  },
  previewAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: colors.ink,
    height: 64,
    width: 64
  },
  previewAvatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900"
  },
  previewName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  previewMeta: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900"
  },
  previewIntro: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  inputGroup: {
    gap: 7,
    marginTop: 14
  },
  inputLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  input: {
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: "top"
  }
});

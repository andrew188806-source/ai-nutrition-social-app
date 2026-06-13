import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, SectionTitle, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import {
  AvatarUploader,
  CommunityCardPreview,
  CommunityCardPreviewModeToggle,
  CommunityPrivacySettings,
  DiningPreferenceSettings,
  ProfileTextFields,
  SystemAvatarSelector,
  TagSelector,
  type CommunityCardSettingsState,
  type PreviewMode,
  type SystemMascot,
  type VisibilityLevel,
  getCommunityCardSettings,
  saveCommunityCardSettings
} from "../features/community-card-settings";

export default function CommunityCardSettingsScreen() {
  const mascots = zhTW.mobile.communityCardSettings.mascots as readonly SystemMascot[];
  const [previewMode, setPreviewMode] = useState<PreviewMode>("free");
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<CommunityCardSettingsState>(() => getCommunityCardSettings());

  const selectedMascot = useMemo(() => mascots.find((mascot) => mascot.id === settings.selectedMascotId) ?? mascots[0], [mascots, settings.selectedMascotId]);

  function toggleTag(group: "selectedEatingTags" | "selectedHealthTags" | "selectedBuddyTags", tag: string) {
    setSaved(false);
    setSettings((current) => {
      const selected = current[group].includes(tag);
      return {
        ...current,
        [group]: selected ? current[group].filter((item) => item !== tag) : [...current[group], tag]
      };
    });
  }

  function togglePreferenceTag(group: "avoidedFoods" | "dietTypes", tag: string) {
    setSaved(false);
    setSettings((current) => {
      const selected = current[group].includes(tag);
      return {
        ...current,
        [group]: selected ? current[group].filter((item) => item !== tag) : [...current[group], tag]
      };
    });
  }

  function updateDiningPreference(field: "spicePreference" | "gatheringStyle" | "paymentPreference" | "areaVisibility" | "calorieGoalVisibility", value: string) {
    setSaved(false);
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function updateVisibility(fieldId: string, level: VisibilityLevel) {
    setSaved(false);
    setSettings((current) => ({
      ...current,
      fieldVisibility: { ...current.fieldVisibility, [fieldId]: level }
    }));
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.communityCardSettings.title}
      subtitle={zhTW.mobile.communityCardSettings.subtitle}
      primaryAction={{ href: "/community-card", label: zhTW.mobile.communityCard.previewTitle }}
      secondaryAction={{ href: "/permissions", label: zhTW.mobile.primaryNav.profile }}
    >
      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.communityCardSettings.anonymousTitle} subtitle={zhTW.mobile.communityCardSettings.anonymousBody} />
        <Text style={styles.note}>{zhTW.mobile.communityCardSettings.premiumHint}</Text>
      </Card>

      <ProfileTextFields
        age={settings.age}
        gender={settings.gender}
        intro={settings.intro}
        nickname={settings.nickname}
        onAgeChange={(age) => {
          setSaved(false);
          setSettings((current) => ({ ...current, age }));
        }}
        onGenderChange={(gender) => {
          setSaved(false);
          setSettings((current) => ({ ...current, gender }));
        }}
        onIntroChange={(intro) => {
          setSaved(false);
          setSettings((current) => ({ ...current, intro }));
        }}
        onNicknameChange={(nickname) => {
          setSaved(false);
          setSettings((current) => ({ ...current, nickname }));
        }}
      />

      <TagSelector selectedTags={settings.selectedEatingTags} tags={zhTW.mobile.communityCardSettings.eatingPreferenceTags} title={zhTW.mobile.communityCardSettings.eatingPreferenceTitle} onToggle={(tag) => toggleTag("selectedEatingTags", tag)} />
      <TagSelector selectedTags={settings.selectedHealthTags} tags={zhTW.mobile.communityCardSettings.healthGoalTags} title={zhTW.mobile.communityCardSettings.healthGoalTitle} onToggle={(tag) => toggleTag("selectedHealthTags", tag)} />
      <TagSelector selectedTags={settings.selectedBuddyTags} tags={zhTW.mobile.communityCardSettings.mealBuddyTypeTags} title={zhTW.mobile.communityCardSettings.mealBuddyTypeTitle} onToggle={(tag) => toggleTag("selectedBuddyTags", tag)} />
      <DiningPreferenceSettings settings={settings} onSelect={updateDiningPreference} onToggle={togglePreferenceTag} />

      <SystemAvatarSelector
        mascots={mascots}
        selectedId={settings.selectedMascotId}
        onSelect={(selectedMascotId) => {
          setSaved(false);
          setSettings((current) => ({ ...current, publicMascotAvatarId: selectedMascotId, selectedMascotId }));
        }}
      />

      <AvatarUploader
        hasUploadedPhoto={settings.hasUploadedPhoto}
        onUpload={() => {
          setSaved(false);
          setSettings((current) => ({ ...current, hasUploadedPhoto: true, privateAvatarAssetKey: "IMG" }));
        }}
      />

      <CommunityPrivacySettings settings={settings} onChange={updateVisibility} />

      <Card>
        <SectionTitle title={zhTW.mobile.communityCardSettings.previewTitle} subtitle={zhTW.mobile.communityCardSettings.previewBody} />
        <CommunityCardPreviewModeToggle mode={previewMode} onChange={setPreviewMode} />
      </Card>
      <CommunityCardPreview mascot={selectedMascot} mode={previewMode} settings={settings} />

      <Card tone="amber">
        <Pressable
          style={styles.saveButton}
          onPress={() => {
            saveCommunityCardSettings(settings);
            setSaved(true);
          }}
        >
          <Text style={styles.saveButtonText}>{zhTW.mobile.communityCardSettings.saveCta}</Text>
        </Pressable>
        {saved ? <Text style={styles.savedText}>{zhTW.mobile.communityCardSettings.savedMessage}</Text> : null}
      </Card>
    </PlaceholderScreen>
  );
}

const styles = StyleSheet.create({
  note: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 12
  },
  saveButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  savedText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12,
    textAlign: "center"
  }
});

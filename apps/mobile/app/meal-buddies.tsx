import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, DemoModeToggle, PremiumBadge, SectionTitle, TagRow, UpgradePromptModal, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { Card as SnowCard, Chip, PrimaryButton, SecondaryButton, SectionHeader as SnowSectionHeader, StatCard, getMascotSource } from "../theme/components";
import { Icon, type IconName } from "../theme/icons";
import { fonts, hexA, radius, shadows, snowPalette as snow } from "../theme/tokens";
import { getCommunityCardSettings } from "../features/community-card-settings";
import {
  addMealBuddyChatMessage,
  addMealBuddyChatSystemMessage,
  createOrOpenGroupTableChat,
  createOrOpenMealSessionChat,
  createMealBuddyInvite,
  createMealBuddyCard,
  acceptMealBuddyInvite,
  clearPendingMatchRequest,
  declineMealBuddyInvite,
  deleteMealBuddyInvite,
  deleteMealBuddyCard,
  drawMatchedMealBuddyCandidates,
  getActiveCardUsage,
  getActiveMealBuddyCards,
  getCandidateDisplayProfile,
  getDailyVisibleUsage,
  getMealBuddyCandidates,
  getMealBuddyCardId,
  getMealBuddyChats,
  getMealBuddyInvites,
  getMockTableParticipantCandidates,
  getPendingMatchRequest,
  getPendingInviteForCandidate,
  MealBuddyRecommendationList,
  mockGatheringRecords,
  mockMatchedBuddies,
  rankMealBuddyRecommendations,
  upsertMealBuddyCardWithQuota,
  type MealBuddyCard,
  type MealBuddyCardType,
  type MockGatheringRecord,
  type MockMatchedBuddy,
  type RankedMealBuddyCandidate
} from "../features/meal-buddy-card";
// Imported from their own modules, not from the SR-2G-E1 barrel: that barrel is the frozen DATA
// LAYER and stays render-free, so nothing that renders is re-exported through it.
import { MealBuddyRealCandidateSection } from "../features/meal-buddy-candidates/MealBuddyRealCandidateSection";
import { MealBuddyRealSourceCardPicker } from "../features/meal-buddy-candidates/MealBuddyRealSourceCardPicker";
import {
  useMealBuddyRealCandidates,
  type MealBuddyRealCandidatesController
} from "../features/meal-buddy-candidates/useMealBuddyRealCandidates";
import { useConsumerRuntime } from "../features/consumer-runtime";
import {
  buildRecommendationMealBuddyCardCreateRequest,
  createRecommendationMealBuddyCard
} from "../features/meal-buddy-card-create";
import { resolveCommunityProfileDisplay, type AvatarSource, type CommunityProfileDisplay } from "../features/display-resolvers";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { clearU1NextMealBuddyPrefill, consumeU1NextMealBuddyPrefill, type U1NextMealBuddyPrefillViewModel } from "../features/next-meal-prototype";
import { storage } from "../lib/storage";
import { GroupTablesContent } from "./group-tables";

type MealBuddySection = "discover" | "cards" | "friends" | "gatherings" | "tables";
type MyFriendsTab = "matched" | "invitations" | "chats";
type FriendSort = "飯局數" | "認識時間" | "最近同桌";

type RecommendationGroup = {
  card: MealBuddyCard;
  highlight: boolean;
  id: string;
  items: RankedMealBuddyCandidate[];
  quotaFull: boolean;
  sourceCardId: string;
  sourceCardName: string;
  sourceCardType: MealBuddyCard["cardType"];
  generatedAt: string;
};

const recommendationStorageKey = "haocu.mealBuddy.recommendationGroups.v1";

function parseMealBuddySection(section?: string): MealBuddySection {
  if (section === "friends" || section === "gatherings" || section === "tables" || section === "cards") {
    return section;
  }
  return "discover";
}

function getVisibleMatchedFriends(invites: ReturnType<typeof getMealBuddyInvites>): MatchedFriend[] {
  const acceptedBuddyIds = new Set(invites.filter((invite) => invite.status === "accepted" && invite.profileId).map((invite) => invite.profileId as string));
  const baseFriends = mockMatchedBuddies.filter((friend) => friend.id !== "ivy" || acceptedBuddyIds.has("ivy"));
  const existingIds = new Set(baseFriends.map((friend) => friend.id));
  const acceptedInviteFriends = invites
    .filter((invite) => invite.status === "accepted" && Boolean(invite.profileId) && (invite.type === "chat" || invite.type === "meal"))
    .map(createMatchedBuddyFromInvitation)
    .filter((friend) => !existingIds.has(friend.id));
  return [...baseFriends, ...acceptedInviteFriends];
}

function resolveInvitationProfileDisplay(invite: ReturnType<typeof getMealBuddyInvites>[number]) {
  return resolveCommunityProfileDisplay(invite.profileId);
}

function invitationDisplayName(invite: ReturnType<typeof getMealBuddyInvites>[number], profile: CommunityProfileDisplay | null) {
  if (invite.type === "table") {
    return profile?.displayName ?? invite.tableName ?? "";
  }
  return profile?.displayName ?? "";
}

function resolveChatProfileDisplay(chat?: ReturnType<typeof getMealBuddyChats>[number] | null) {
  if (!chat || chat.threadType === "group") {
    return null;
  }
  return resolveCommunityProfileDisplay(chat?.participantProfileId);
}

function chatDisplayName(chat: ReturnType<typeof getMealBuddyChats>[number], profile: CommunityProfileDisplay | null) {
  if (profile) {
    return profile.displayName;
  }
  return chat.threadType === "group" ? chat.userName || chat.tableId || "四人桌群聊" : "飯友";
}

function chatSummaryText(chat: ReturnType<typeof getMealBuddyChats>[number], profile: CommunityProfileDisplay | null) {
  if (profile) {
    return profile.shortProfileSummary;
  }
  return chat.threadType === "group" ? chat.relatedMeal : "";
}

function resolveMatchedFriendProfileDisplay(friend: MatchedFriend) {
  return resolveCommunityProfileDisplay(friend.profileId);
}

function createMatchedBuddyFromInvitation(invite: ReturnType<typeof getMealBuddyInvites>[number]): MatchedFriend {
  const profileId = invite.profileId ?? "";
  const chatId = `chat-direct-${profileId}`;
  const referenceOnlyFriend = {
    id: profileId,
    profileId,
    invitationId: invite.id,
    buddyId: profileId,
    chatId,
    mealCount: 1,
    knownSince: "2026/06/04",
    lastTable: invite.time,
    chatThreadId: chatId
  } satisfies MatchedFriend & { invitationId: string; buddyId: string; chatId: string };
  return referenceOnlyFriend;
}

function readPersistedRecommendationGroups(_activeCards: MealBuddyCard[]) {
  const activeCardIds = new Set(_activeCards.map(getMealBuddyCardId));
  const memoryFallback = (globalThis as typeof globalThis & { __mealBuddyRecommendationGroups?: RecommendationGroup[] }).__mealBuddyRecommendationGroups ?? [];
  const raw = storage.getItem(recommendationStorageKey);
  const parsed = raw ? safelyParseRecommendationGroups(raw) : memoryFallback;
  return parsed
    .filter((group) => activeCardIds.has(group.sourceCardId ?? getMealBuddyCardId(group.card)))
    .map((group) => ({ ...group, highlight: false }));
}

function persistRecommendationGroups(groups: RecommendationGroup[]) {
  (globalThis as typeof globalThis & { __mealBuddyRecommendationGroups?: RecommendationGroup[] }).__mealBuddyRecommendationGroups = groups;
  storage.setItem(recommendationStorageKey, JSON.stringify(groups));
}

function safelyParseRecommendationGroups(raw: string): RecommendationGroup[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type MatchedFriend = MockMatchedBuddy;
type GatheringRecord = MockGatheringRecord;

const gatheringRecords = mockGatheringRecords;

export default function MealBuddyHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    highlightCardCreatedAt?: string;
    restaurantActionType?: string;
    restaurantId?: string;
    restaurantLocation?: string;
    restaurantName?: string;
    restaurantTags?: string;
    section?: string;
    tableAction?: string;
    tableTime?: string;
    u1PrefillToken?: string;
  }>();
  const pendingMatch = getPendingMatchRequest();
  const initialCards = getActiveMealBuddyCards();
  const [demoMode, setDemoMode] = useDemoUserPlan();
  const [activeSection, setActiveSection] = useState<MealBuddySection>(() => parseMealBuddySection(params.section));
  const [activeCards, setActiveCards] = useState<MealBuddyCard[]>(() => initialCards);
  const [showFreeQuotaModal, setShowFreeQuotaModal] = useState(false);
  const [paidQuotaMessage, setPaidQuotaMessage] = useState("");
  const [recommendationGroups, setRecommendationGroups] = useState<RecommendationGroup[]>(() => readPersistedRecommendationGroups(initialCards));
  const [friendInitialTab, setFriendInitialTab] = useState<MyFriendsTab>("matched");
  const [focusedChatId, setFocusedChatId] = useState("");
  const [focusedChatName, setFocusedChatName] = useState("");
  const [, setSocialVersion] = useState(0);
  const [acceptedMealInvite, setAcceptedMealInvite] = useState<ReturnType<typeof getMealBuddyInvites>[number] | null>(null);
  const [u1Prefill, setU1Prefill] = useState<U1NextMealBuddyPrefillViewModel | null>(null);
  // SR-2G-E2: authenticated real mode. In this mode the candidate list comes ONLY from the frozen
  // SR-2G-D endpoint via the SR-2G-E1 data layer, and the mock candidate pipeline below
  // (getMealBuddyCandidates / rankMealBuddyRecommendations / drawMatchedMealBuddyCandidates) is not
  // reachable at all — not as a source, not as a fallback and not on error.
  const consumerRuntime = useConsumerRuntime();
  const isRealCandidateMode = consumerRuntime.mode === "supabase";
  const realCandidates = useMealBuddyRealCandidates(isRealCandidateMode);
  const loadRealSourceCards = realCandidates.loadSourceCards;
  // The actor's own real cards are read once when real mode becomes active. Leaving real mode is
  // handled inside the hook, which resets the cards, the selection and the candidates together.
  useEffect(() => {
    if (isRealCandidateMode) void loadRealSourceCards();
  }, [isRealCandidateMode, loadRealSourceCards]);
  const dailyUsage = getDailyVisibleUsage(demoMode);
  const cardUsage = getActiveCardUsage(demoMode);
  const chats = getMealBuddyChats();
  const invites = getMealBuddyInvites();
  const matchedFriends = getVisibleMatchedFriends(invites);
  const openCommunityProfile = (profileId?: string) => {
    if (profileId) {
      router.push({ pathname: "/community-profile/[profileId]", params: { profileId } });
    }
  };
  const openRealCandidateProfile = (candidateRef: string) => {
    // Expo regenerates its ignored typed-route cache during export/start. This route is new in the
    // current candidate, so the checked source is cast only across that generated-cache boundary;
    // the runtime value remains the exact opaque ref and is revalidated by the destination/Edge.
    router.push({
      pathname: "/meal-buddy-candidate-profile/[candidateRef]",
      params: { candidateRef }
    } as never);
  };

  // Meal Buddy is one shared system: Free/Paid only changes limits, masking, and upgrade prompts.
  // AI/manual/restaurant cards share the same card list; source only controls the small visual label.
  useEffect(() => {
    if (pendingMatch) {
      setDemoMode(pendingMatch.mode);
      clearPendingMatchRequest();
    }
  }, []);

  useEffect(() => {
    setActiveSection(parseMealBuddySection(params.section));
  }, [params.section]);

  useEffect(() => {
    if (!params.u1PrefillToken) {
      clearU1NextMealBuddyPrefill();
      setU1Prefill(null);
      return;
    }
    setU1Prefill(consumeU1NextMealBuddyPrefill(params.u1PrefillToken));
  }, [params.u1PrefillToken]);

  useEffect(() => {
    persistRecommendationGroups(recommendationGroups);
  }, [recommendationGroups]);

  useEffect(() => {
    if (!recommendationGroups.some((group) => group.highlight)) {
      return;
    }
    const timer = setTimeout(() => {
      setRecommendationGroups((groups) => groups.map((group) => ({ ...group, highlight: false })));
    }, 1600);
    return () => clearTimeout(timer);
  }, [recommendationGroups]);

  function goToMatchedBuddies() {
    setFriendInitialTab("matched");
    setActiveSection("friends");
  }

  function goToPendingInvites() {
    setFriendInitialTab("invitations");
    setActiveSection("friends");
  }

  function goToChats() {
    setFocusedChatId("");
    setFocusedChatName("");
    setFriendInitialTab("chats");
    setActiveSection("friends");
  }

  function goToMealTables() {
    setActiveSection("gatherings");
  }

  function goToFourSeatTableCreation() {
    setActiveSection("tables");
  }

  return (
    <PlaceholderScreen
      title={zhTW.mobile.mainSections.friendsTitle}
      subtitle="營養分析、飯友推薦、聊天與四人餐桌都在這裡，先選一個想進行的社交吃飯情境。"
    >
      <UpgradePromptModal
        actionLabel="稍後再說"
        body="升級後可查看更多飯友、完整社群卡與更多每日推薦額度。"
        secondaryActionLabel="切換付費版"
        title="想看更多飯友嗎？"
        visible={showFreeQuotaModal}
        onClose={() => setShowFreeQuotaModal(false)}
        onSecondaryAction={() => {
          setShowFreeQuotaModal(false);
          setDemoMode("premium");
        }}
      />
      <DemoModeToggle mode={demoMode} onChange={setDemoMode} />

      {activeSection !== "discover" && activeSection !== "cards" ? (
        <View style={styles.snowChipRow}>
          <Chip label="飯友" active={activeSection === "friends" && friendInitialTab !== "chats"} onPress={() => { setActiveSection("friends"); setFriendInitialTab("matched"); }} />
          <Chip label="聊天" active={activeSection === "friends" && friendInitialTab === "chats"} onPress={() => { setActiveSection("friends"); setFriendInitialTab("chats"); setFocusedChatId(""); setFocusedChatName(""); }} />
          <Chip label="飯局" active={activeSection === "gatherings" || activeSection === "tables"} onPress={() => setActiveSection("gatherings")} />
        </View>
      ) : null}

      {activeSection === "discover" || activeSection === "cards" ? (
        <DiscoverSection
          hideRecommendations={activeSection === "cards"}
          activeCards={activeCards}
          cardUsage={cardUsage}
          chats={chats}
          dailyUsage={dailyUsage}
          invites={invites}
          isPremium={demoMode === "premium"}
          highlightCardCreatedAt={params.highlightCardCreatedAt}
          matchedFriendsCount={matchedFriends.length}
          isRealCandidateMode={isRealCandidateMode}
          realCandidates={realCandidates}
          recommendationGroups={recommendationGroups}
          onCardsChanged={() => setActiveCards(getActiveMealBuddyCards())}
          onGoToChats={goToChats}
          onGoToFourSeatTableCreation={goToFourSeatTableCreation}
          onGoToMatchedBuddies={goToMatchedBuddies}
          onGoToMealTables={goToMealTables}
          onGoToPendingInvites={goToPendingInvites}
          onDeleteCard={(card) => {
            deleteMealBuddyCard(card);
            setActiveCards(getActiveMealBuddyCards());
            setRecommendationGroups((groups) => groups.filter((group) => group.sourceCardId !== getMealBuddyCardId(card)));
          }}
          onInviteEat={(candidate, card) => {
            createMealBuddyInvite(candidate, "meal", card);
            setSocialVersion((version) => version + 1);
          }}
          onInviteTable={(candidate, card) => {
            createMealBuddyInvite(candidate, "table", card);
            setSocialVersion((version) => version + 1);
          }}
          onOpenChat={(candidate, card) => {
            createMealBuddyInvite(candidate, "chat", card);
            setSocialVersion((version) => version + 1);
          }}
          onOpenPremium={() => setShowFreeQuotaModal(true)}
          onOpenRealCandidateProfile={openRealCandidateProfile}
          onViewCandidateCard={() => undefined}
          onUseCard={(card) => {
            setPaidQuotaMessage("");
            // Real mode never reaches the mock pipeline below. It also never maps this demo card
            // onto a real one: the demo shape carries no meal period, so it is not a valid source
            // identity. Real mode selects a real card by its own opaque reference, in the picker.
            if (isRealCandidateMode) return;
            const ranked = rankMealBuddyRecommendations(card, getMealBuddyCandidates());
            const draw = drawMatchedMealBuddyCandidates(demoMode, ranked, demoMode === "premium" ? 5 : 3);
            if (draw.allowed === 0) {
              if (demoMode === "premium") {
                setPaidQuotaMessage("今天的推薦額度已用完，可以明天再查看新的飯友。");
              } else {
                setShowFreeQuotaModal(true);
              }
              return;
            }
            const group: RecommendationGroup = {
              card,
              generatedAt: new Date().toISOString(),
              highlight: true,
              id: `${card.createdAt}-${Date.now()}`,
              items: draw.items,
              quotaFull: false,
              sourceCardId: getMealBuddyCardId(card),
              sourceCardName: card.preferredFoodName || card.restaurantName || "飯友卡",
              sourceCardType: card.cardType
            };
            setRecommendationGroups((groups) => [group, ...groups.map((item) => ({ ...item, highlight: false }))].slice(0, demoMode === "premium" ? 4 : 2));
            focusElementAfterRender(recommendationGroupElementId(group.id));
          }}
          paidQuotaMessage={paidQuotaMessage}
          onOpenProfile={openCommunityProfile}
          u1Prefill={u1Prefill}
        />
      ) : null}

      {activeSection === "friends" ? (
        <MyFriendsSection
          chats={chats}
          focusedChatId={focusedChatId}
          focusedChatName={focusedChatName}
          friends={matchedFriends}
          initialTab={friendInitialTab}
          invites={invites}
          isPremium={demoMode === "premium"}
          onOpenProfile={openCommunityProfile}
          onAcceptInvite={(invite) => {
            acceptMealBuddyInvite(invite);
            const updatedInvite = getMealBuddyInvites().find((item) => item.id === invite.id) ?? invite;
            setSocialVersion((version) => version + 1);
            if (invite.type === "chat" || invite.type === "meal") {
              const chat = getMealBuddyChats().find((item) => item.participantProfileId === invite.profileId);
              setFocusedChatId(chat?.id ?? "");
              setFocusedChatName(invitationDisplayName(updatedInvite, resolveInvitationProfileDisplay(updatedInvite)));
              setFriendInitialTab("chats");
            } else {
              setAcceptedMealInvite(updatedInvite);
              setActiveSection("gatherings");
            }
          }}
          onDeclineInvite={(invite) => {
            declineMealBuddyInvite(invite);
            setSocialVersion((version) => version + 1);
            setFriendInitialTab("invitations");
          }}
          onDeleteInvite={(invite) => {
            deleteMealBuddyInvite(invite);
            setSocialVersion((version) => version + 1);
          }}
          onChatUpdated={() => setSocialVersion((version) => version + 1)}
        />
      ) : null}
      {activeSection === "gatherings" ? (
        <GatheringsSection
          acceptedInvite={acceptedMealInvite}
          invites={invites}
          onOpenProfile={openCommunityProfile}
          onAcceptInvite={(invite) => {
            acceptMealBuddyInvite(invite);
            const updatedInvite = getMealBuddyInvites().find((item) => item.id === invite.id) ?? invite;
            setSocialVersion((version) => version + 1);
            if (invite.type === "table") {
              setAcceptedMealInvite(updatedInvite);
              return;
            }
            setFriendInitialTab("chats");
            setActiveSection("friends");
          }}
          onDeclineInvite={(invite) => {
            declineMealBuddyInvite(invite);
            setSocialVersion((version) => version + 1);
          }}
          onOpenChat={(record) => {
            let targetChat;
            if (record.source === "group_table" || record.tableId) {
              targetChat = createOrOpenGroupTableChat(record.chatName, record.tableId, record.chatThreadId);
            } else {
              targetChat = createOrOpenMealSessionChat({
                buddyId: record.buddyId,
                chatThreadId: record.chatThreadId,
                participantProfileId: record.participantProfileId,
                userName: record.participantProfileId ?? record.chatName ?? record.id,
                relatedMeal: record.name || "一般飯友飯局"
              });
            }
            setSocialVersion((version) => version + 1);
            setFocusedChatId(targetChat.id);
            setFocusedChatName(chatDisplayName(targetChat, resolveChatProfileDisplay(targetChat)));
            setFriendInitialTab("chats");
            setActiveSection("friends");
          }}
        />
      ) : null}
      {activeSection === "tables" ? (
        <GroupTablesContent
          restaurantContext={
            params.restaurantName
              ? {
                  action: params.restaurantActionType === "createFourPersonTable" || params.tableAction === "create" ? "create" : "find",
                  restaurantId: params.restaurantId ?? `restaurant-${params.restaurantName}`,
                  restaurantLocation: params.restaurantLocation ?? "",
                  restaurantName: params.restaurantName,
                  restaurantTags: params.restaurantTags?.split("、").filter(Boolean) ?? [],
                  suggestedTime: params.tableTime ?? "今晚 19:00"
                }
              : undefined
          }
          onOpenChat={({ chatThreadId, tableId, tableName }) => {
            const chat = createOrOpenGroupTableChat(tableName, tableId, chatThreadId);
            setSocialVersion((version) => version + 1);
            setFocusedChatId(chat.id);
            setFocusedChatName(chatDisplayName(chat, resolveChatProfileDisplay(chat)));
            setFriendInitialTab("chats");
            setActiveSection("friends");
          }}
        />
      ) : null}
    </PlaceholderScreen>
  );
}

function focusElementAfterRender(elementId: string, clearHighlight?: () => void) {
  setTimeout(() => {
    const browserWindow = (globalThis as typeof globalThis & { window?: { document?: { getElementById?: (id: string) => { scrollIntoView?: (options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition }) => void } | null } } }).window;
    const element = browserWindow?.document?.getElementById?.(elementId);
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    clearHighlight?.();
  }, 120);
}

function mealBuddyCardElementId(card: MealBuddyCard) {
  return `meal-buddy-card-${card.createdAt.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function recommendationGroupElementId(groupId: string) {
  return `meal-buddy-recommendations-${groupId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function StatusEntry({ icon, label, value, dot = false, onPress }: { icon: IconName; label: string; value: string; dot?: boolean; onPress?: () => void }) {
  return (
    <Pressable style={styles.statusEntry} onPress={onPress}>
      <View style={styles.statusEntryIconWrap}>
        <Icon name={icon} size={18} color={snow.primaryDeep} />
        {dot ? <View style={styles.statusEntryDot} /> : null}
      </View>
      <Text style={styles.statusEntryValue}>{value}</Text>
      <Text style={styles.statusEntryLabel}>{label}</Text>
    </Pressable>
  );
}

function DiscoverSection({
  activeCards,
  cardUsage,
  chats,
  dailyUsage,
  hideRecommendations,
  invites,
  highlightCardCreatedAt,
  isPremium,
  isRealCandidateMode,
  matchedFriendsCount,
  paidQuotaMessage,
  realCandidates,
  recommendationGroups,
  onCardsChanged,
  onDeleteCard,
  onGoToChats,
  onGoToFourSeatTableCreation,
  onGoToMatchedBuddies,
  onGoToMealTables,
  onGoToPendingInvites,
  onInviteEat,
  onInviteTable,
  onOpenChat,
  onOpenPremium,
  onOpenRealCandidateProfile,
  onOpenProfile,
  onViewCandidateCard,
  onUseCard,
  u1Prefill
}: {
  activeCards: MealBuddyCard[];
  cardUsage: ReturnType<typeof getActiveCardUsage>;
  chats: ReturnType<typeof getMealBuddyChats>;
  dailyUsage: ReturnType<typeof getDailyVisibleUsage>;
  hideRecommendations?: boolean;
  invites: ReturnType<typeof getMealBuddyInvites>;
  highlightCardCreatedAt?: string;
  isPremium: boolean;
  isRealCandidateMode: boolean;
  matchedFriendsCount: number;
  paidQuotaMessage: string;
  realCandidates: MealBuddyRealCandidatesController;
  recommendationGroups: RecommendationGroup[];
  onCardsChanged: () => void;
  onDeleteCard: (card: MealBuddyCard) => void;
  onGoToChats: () => void;
  onGoToFourSeatTableCreation: () => void;
  onGoToMatchedBuddies: () => void;
  onGoToMealTables: () => void;
  onGoToPendingInvites: () => void;
  onInviteEat: (candidate: RankedMealBuddyCandidate, card: MealBuddyCard) => void;
  onInviteTable: (candidate: RankedMealBuddyCandidate, card: MealBuddyCard) => void;
  onOpenChat: (candidate: RankedMealBuddyCandidate, card: MealBuddyCard) => void;
  onOpenPremium: () => void;
  onOpenRealCandidateProfile: (candidateRef: string) => void;
  onOpenProfile: (profileId?: string) => void;
  onViewCandidateCard: (candidate: RankedMealBuddyCandidate) => void;
  onUseCard: (card: MealBuddyCard) => void;
  u1Prefill: U1NextMealBuddyPrefillViewModel | null;
}) {
  const [previewCandidate, setPreviewCandidate] = useState<RankedMealBuddyCandidate | null>(null);
  const [previewCard, setPreviewCard] = useState<MealBuddyCard | null>(null);
  const [formTarget, setFormTarget] = useState<{ card?: MealBuddyCard; cardType: MealBuddyCardType; mode: "create" | "edit"; prefill?: U1NextMealBuddyPrefillViewModel } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState({ all: true });
  const [highlightCardId, setHighlightCardId] = useState("");
  const [cardQuotaMessage, setCardQuotaMessage] = useState("");
  useEffect(() => {
    const targetCard = activeCards.find((card) => card.createdAt === highlightCardCreatedAt) ?? activeCards.find((card) => card.sourceType === "ai_recommendation");
    if (!targetCard) return;
    setHighlightCardId(targetCard.createdAt);
    setExpandedGroups((current) => ({ ...current, all: true }));
    focusElementAfterRender(mealBuddyCardElementId(targetCard), () => setTimeout(() => setHighlightCardId(""), 1600));
  }, [highlightCardCreatedAt]);

  useEffect(() => {
    if (!u1Prefill) return;
    const targetUsage = u1Prefill.selectedRecommendation ? cardUsage.restaurant : cardUsage.general;
    if (targetUsage.count >= targetUsage.limit) {
      setCardQuotaMessage(isPremium ? "目前飯友卡數量已達上限，請先整理既有卡片。" : "目前飯友卡數量已達上限，請先整理既有卡片再繼續。");
      return;
    }
    setCardQuotaMessage("");
    setFormTarget({ cardType: u1Prefill.selectedRecommendation ? "restaurant" : "general", mode: "create", prefill: u1Prefill });
  }, [u1Prefill?.handoffId]);

  function requestCreateCard(cardType: MealBuddyCardType) {
    setCardQuotaMessage("");
    const usage = cardType === "restaurant" ? cardUsage.restaurant : cardUsage.general;
    if (usage.count >= usage.limit) {
      if (isPremium) {
        setCardQuotaMessage("目前飯友卡數量已達上限，系統會保留最新且最相關的卡片。");
      } else {
        onOpenPremium();
      }
      return;
    }
    setFormTarget({ cardType, mode: "create" });
  }

  async function saveInlineCard(input: MealBuddyCardFormValue) {
    clearU1NextMealBuddyPrefill();

    if (isRealCandidateMode && formTarget?.mode === "create" && formTarget.prefill?.selectedRecommendation) {
      const request = buildRecommendationMealBuddyCardCreateRequest(formTarget.prefill);
      if (!request) {
        setCardQuotaMessage("這筆推薦缺少可驗證的餐點資料，請重新選擇推薦。");
        return;
      }
      const result = await createRecommendationMealBuddyCard(request);
      if (!result.ok) {
        setCardQuotaMessage(result.errorCode === "card_quota_exceeded"
          ? "目前飯友卡數量已達上限，請先整理既有卡片。"
          : "飯友卡暫時無法建立，請稍後再試。");
        return;
      }
      setCardQuotaMessage("");
      setFormTarget(null);
      await realCandidates.loadSourceCards();
      return;
    }

    if (formTarget?.mode === "edit" && formTarget.card) {
      deleteMealBuddyCard(formTarget.card);
    }

    const nextCard = createMealBuddyCard({
      cardType: formTarget?.cardType ?? "general",
      sourceType: formTarget?.card?.sourceType ?? (formTarget?.prefill ? "ai_recommendation" : formTarget?.cardType === "restaurant" ? "restaurant_page" : "manual"),
      intentionType: "chat_first",
      preferredFoodName: input.foodName,
      restaurantName: formTarget?.cardType === "restaurant" ? input.restaurantName : "",
      restaurantId: formTarget?.prefill?.selectedRecommendation?.restaurantId ?? formTarget?.card?.restaurantId ?? "",
      menuItemId: formTarget?.prefill?.selectedRecommendation?.menuItemId ?? formTarget?.card?.menuItemId,
      foodCategory: input.foodCategory,
      area: input.area,
      preferredTime: input.preferredTime,
      nutritionGoal: input.note || input.paymentPreference,
      visibilityStatus: "active"
    });
    upsertMealBuddyCardWithQuota(nextCard, isPremium ? "premium" : "free");
    onCardsChanged();
    setHighlightCardId(nextCard.createdAt);
    setExpandedGroups((current) => ({ ...current, all: true }));
    setFormTarget(null);
    focusElementAfterRender(mealBuddyCardElementId(nextCard));
    setTimeout(() => setHighlightCardId(""), 1600);
  }

  return (
    <>
      <View nativeID="meal-buddy-my-cards-section">
        <SnowCard>
          <SnowSectionHeader title="我的飯友卡" subtitle="管理飯友卡、前往已配對飯友與多人飯局。" />

          <View style={styles.actionButtonGrid}>
            <Pressable style={[styles.actionButton, styles.actionButtonNeutral]} onPress={onGoToMatchedBuddies}>
              <Icon name="buddies" size={16} color={snow.ink} />
              <Text style={styles.actionButtonLabel}>我的飯友</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.actionButtonNeutral]} onPress={onGoToFourSeatTableCreation}>
              <Icon name="table4" size={16} color={snow.ink} />
              <Text style={styles.actionButtonLabel}>多人飯局</Text>
            </Pressable>
          </View>

          <View style={styles.statGrid}>
            <View style={[styles.miniStat, styles.miniStatCoral]}>
              <Icon name="buddies" size={14} color="#B83030" />
              <Text style={[styles.miniStatValue, { color: "#B83030" }]}>{cardUsage.general.count}/{cardUsage.general.limit}</Text>
              <Text style={styles.miniStatLabel}>一般飯友卡</Text>
            </View>
            <View style={[styles.miniStat, styles.miniStatAmber]}>
              <Icon name="plate" size={14} color="#A05010" />
              <Text style={[styles.miniStatValue, { color: "#A05010" }]}>{cardUsage.restaurant.count}/{cardUsage.restaurant.limit}</Text>
              <Text style={styles.miniStatLabel}>餐廳飯友卡</Text>
            </View>
            <View style={[styles.miniStat, styles.miniStatBlue]}>
              <Icon name="spark" size={14} color="#2068B0" />
              <Text style={[styles.miniStatValue, { color: "#2068B0" }]}>{dailyUsage.used}/{dailyUsage.limit}</Text>
              <Text style={styles.miniStatLabel}>今日可看飯友</Text>
            </View>
          </View>

          <View style={styles.cardGroup}>
            <Pressable style={[styles.groupHeaderRow, { marginTop: 0 }]} onPress={() => setExpandedGroups((current) => ({ ...current, all: !current.all }))}>
              <Text style={styles.groupTitleSnow}>卡片列表（{activeCards.length}）</Text>
            </Pressable>
            {expandedGroups.all ? (
              <>
                <View style={styles.cardCreateRow}>
                  <Pressable style={[styles.actionButton, styles.actionButtonCoral]} onPress={() => requestCreateCard("general")}>
                    <Icon name="plus" size={16} color="#B83030" />
                    <Text style={[styles.actionButtonLabel, styles.actionButtonLabelCoral]}>建立飯友卡</Text>
                  </Pressable>
                  <Pressable style={[styles.actionButton, styles.actionButtonAmber]} onPress={() => requestCreateCard("restaurant")}>
                    <Icon name="plate" size={16} color="#A05010" />
                    <Text style={[styles.actionButtonLabel, styles.actionButtonLabelAmber]}>建立餐廳卡</Text>
                  </Pressable>
                </View>
                {cardQuotaMessage ? <Text style={styles.message}>{cardQuotaMessage}</Text> : null}
                {formTarget ? (
                  <InlineMealBuddyCardForm
                    card={formTarget.card}
                    cardType={formTarget.cardType}
                    mode={formTarget.mode}
                    prefill={formTarget.prefill}
                    onCancel={() => {
                      clearU1NextMealBuddyPrefill();
                      setFormTarget(null);
                    }}
                    onSave={(value) => { void saveInlineCard(value); }}
                  />
                ) : null}
                {activeCards.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateTitle}>尚未建立飯友卡</Text>
                    <Text style={styles.emptyStateBody}>目前還沒有飯友卡。可以先建立一張，或從 AI 分析、餐廳頁快速產生。</Text>
                  </View>
                ) : (
                  <View style={styles.cardList}>
                    {activeCards.map((card) => (
                      <MealBuddyCardEntry key={getMealBuddyCardId(card)} card={card} highlighted={highlightCardId === card.createdAt} onDelete={() => onDeleteCard(card)} onEdit={() => setFormTarget({ card, cardType: card.cardType, mode: "edit" })} onUse={() => onUseCard(card)} />
                    ))}
                  </View>
                )}
                <Pressable style={styles.collapseToggle} onPress={() => setExpandedGroups((current) => ({ ...current, all: !current.all }))}>
                  <Text style={styles.collapseToggleText}>收合卡片列表</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.collapseToggle} onPress={() => setExpandedGroups((current) => ({ ...current, all: !current.all }))}>
                <Text style={styles.collapseToggleText}>展開卡片列表</Text>
              </Pressable>
            )}
          </View>
        </SnowCard>
      </View>

      {!hideRecommendations ? (
        <>
          <SnowSectionHeader title="今日推薦飯友" subtitle={`${isPremium ? "依你選擇的飯友卡推薦" : "免費版推薦"} · 今日已看 ${dailyUsage.used}/${dailyUsage.limit}`} />

          {/* SR-2G-E2 real mode. The user picks one of their OWN real active Meal Buddy cards, and
              that card's opaque reference is what the server is asked about. The mock recommendation
              groups below are not rendered at all here, so no demo candidate, no client-side rank
              and no 5/3 draw cap can reach an authenticated screen. */}
          {isRealCandidateMode ? (
            <View style={styles.cardList}>
              <MealBuddyRealSourceCardPicker controller={realCandidates} />
              <MealBuddyRealCandidateSection
                controller={realCandidates}
                onOpenCandidate={onOpenRealCandidateProfile}
              />
            </View>
          ) : null}

          {!isRealCandidateMode && recommendationGroups.length > 0 ? (
            <View style={styles.cardList}>
              {recommendationGroups.map((group) =>
                group.quotaFull ? (
                  <SnowCard key={group.id} tone="primary">
                    <SnowSectionHeader title="今日額度已用完" subtitle={`這張卡：${group.card.preferredFoodName || group.card.restaurantName || "飯友卡"} · ${group.card.preferredTime || "尚未設定時間"}`} />
                    <Text style={styles.message}>{isPremium ? "今天的推薦額度已用完，可以明天再補看。" : "免費版今日推薦額度已用完，升級後可查看更多飯友。"}</Text>
                    {!isPremium ? <SecondaryButton icon="lock" label="查看更多" onPress={onOpenPremium} /> : null}
                  </SnowCard>
                ) : (
                  <View key={group.id} nativeID={recommendationGroupElementId(group.id)} style={group.highlight ? styles.highlightedResultGroup : undefined}>
                    <MealBuddyRecommendationList
                      card={group.card}
                      isPremiumMode={isPremium}
                      items={group.items}
                      onChat={(candidate) => onOpenChat(candidate, group.card)}
                      onEatTogether={(candidate) => onInviteEat(candidate, group.card)}
                      onInviteTable={(candidate) => onInviteTable(candidate, group.card)}
                      pendingInviteForCandidate={(candidate) => getPendingInviteForCandidate(candidate.userId, getMealBuddyCardId(group.card))?.type ?? null}
                      onViewCard={(candidate) => {
                        onOpenProfile(candidate.userId);
                        onViewCandidateCard(candidate);
                      }}
                    />
                    {!isPremium ? (
                      <SnowCard tone="primary">
                        <Text style={styles.message}>免費版每次最多顯示 3 位飯友。升級後可一次查看 5 位，並提高每日推薦額度。</Text>
                        <SecondaryButton icon="lock" label="查看更多" onPress={onOpenPremium} />
                      </SnowCard>
                    ) : null}
                  </View>
                )
              )}
            </View>
          ) : null}
          {paidQuotaMessage ? (
            <SnowCard tone="ai">
              <SnowSectionHeader title="推薦額度提醒" subtitle={paidQuotaMessage} />
            </SnowCard>
          ) : null}
        </>
      ) : null}

      <CandidateCommunityModal
        candidate={previewCandidate}
        isPremium={isPremium}
        onChat={() => {
          if (previewCandidate && previewCard) {
            onOpenChat(previewCandidate, previewCard);
          }
          setPreviewCandidate(null);
          setPreviewCard(null);
        }}
        onClose={() => {
          setPreviewCandidate(null);
          setPreviewCard(null);
        }}
        onEatTogether={() => {
          if (previewCandidate && previewCard) {
            onInviteEat(previewCandidate, previewCard);
          }
          setPreviewCandidate(null);
          setPreviewCard(null);
        }}
        onInviteTable={() => {
          if (previewCandidate && previewCard) {
            onInviteTable(previewCandidate, previewCard);
          }
          setPreviewCandidate(null);
          setPreviewCard(null);
        }}
      />

      <SnowCard tone="primary">
        <SnowSectionHeader title="匿名卡 vs 真人卡" subtitle="飯友卡會依身份顯示不同的頭像與資訊，配對前可以先了解差異。" />
        <View style={styles.compareRow}>
          <View style={styles.compareIconWrap}>
            <Icon name="user" size={18} color={snow.primaryDeep} />
          </View>
          <View style={styles.compareTextWrap}>
            <Text style={styles.compareTitle}>匿名卡</Text>
            <Text style={styles.compareDesc}>顯示匿名頭像與基本喜好，免費與 Premium 用戶皆可配對。</Text>
          </View>
          <Icon name="check" size={18} color={snow.green} />
        </View>
        <View style={[styles.compareRow, styles.compareRowDivider]}>
          <View style={styles.compareIconWrap}>
            <Icon name="star" size={18} color={snow.primaryDeep} />
          </View>
          <View style={styles.compareTextWrap}>
            <Text style={styles.compareTitle}>真人卡</Text>
            <Text style={styles.compareDesc}>顯示真實頭像與完整社群卡，Premium 用戶可查看更多真人飯友配對。</Text>
          </View>
          {isPremium ? <Icon name="check" size={18} color={snow.green} /> : <Icon name="lock" size={18} color={snow.faint} />}
        </View>
        {!isPremium ? (
          <View style={styles.compareCta}>
            <PrimaryButton icon="lock" label="升級解鎖真人卡配對" onPress={onOpenPremium} />
          </View>
        ) : null}
      </SnowCard>
    </>
  );
}


type MealBuddyCardFormValue = {
  area: string;
  foodCategory: string;
  foodName: string;
  note: string;
  paymentPreference: string;
  preferredTime: string;
  restaurantName: string;
};

function InlineMealBuddyCardForm({
  card,
  cardType,
  mode,
  prefill,
  onCancel,
  onSave
}: {
  card?: MealBuddyCard;
  cardType: MealBuddyCardType;
  mode: "create" | "edit";
  prefill?: U1NextMealBuddyPrefillViewModel;
  onCancel: () => void;
  onSave: (input: MealBuddyCardFormValue) => void;
}) {
  const [foodName, setFoodName] = useState(card?.preferredFoodName || prefill?.foodName || "");
  const [preferredTime, setPreferredTime] = useState(card?.preferredTime || prefill?.preferredTime || "");
  const [area, setArea] = useState(card?.area || prefill?.area || "");
  const [restaurantName, setRestaurantName] = useState(card?.restaurantName || prefill?.restaurantName || "");
  const [paymentPreference, setPaymentPreference] = useState("AA 制");
  const [note, setNote] = useState(card?.nutritionGoal || prefill?.note || "");
  const isRestaurantCard = cardType === "restaurant";

  return (
    <View style={styles.inlineForm}>
      <SectionTitle
        title={mode === "create" ? "建立飯友卡" : "編輯飯友卡"}
        subtitle={prefill ? "已帶入下一餐範例；確認並主動儲存前，不會建立飯友卡或使用推薦額度。" : "補上這次想吃的餐點、時間與地區，系統會用同一套飯友卡去推薦。"}
      />
      <View style={styles.formGrid}>
        <LabeledInput label="餐點名稱" value={foodName} onChangeText={setFoodName} placeholder="例如：雞胸便當" />
        <LabeledInput label="用餐時間" value={preferredTime} onChangeText={setPreferredTime} placeholder="例如：今天 18:30" />
        <LabeledInput label="地區" value={area} onChangeText={setArea} placeholder="例如：信義區" />
        {isRestaurantCard ? <LabeledInput label="餐廳名稱" value={restaurantName} onChangeText={setRestaurantName} placeholder="例如：小森健康食堂" /> : null}
        <LabeledInput label="營養目標或備註" value={note} onChangeText={setNote} placeholder="例如：清爽一點、補蛋白質" />
      </View>
      <Text style={styles.formLabel}>付款偏好</Text>
      <View style={styles.tabRow}>
        {["AA 制", "AB 制", "我請客", "看情況"].map((option) => (
          <Pressable key={option} style={[styles.filterButton, paymentPreference === option && styles.tabButtonActive]} onPress={() => setPaymentPreference(option)}>
            <Text style={[styles.tabButtonText, paymentPreference === option && styles.tabButtonTextActive]}>{option}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actionRow}>
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            onSave({
              area,
              // Compatibility display only. There is intentionally no category/context editor;
              // canonical matching metadata is derived from selectedRecommendation on the server.
              foodCategory: card?.foodCategory || prefill?.foodName || foodName,
              foodName: foodName || (isRestaurantCard ? restaurantName : "想吃的餐點"),
              note,
              paymentPreference,
              preferredTime,
              restaurantName
            })
          }
        >
          <Text style={styles.primaryButtonText}>{mode === "create" ? "儲存飯友卡" : "儲存修改"}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>取消</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LabeledInput({ label, onChangeText, placeholder, value }: { label: string; onChangeText: (value: string) => void; placeholder: string; value: string }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} value={value} onChangeText={onChangeText} />
    </View>
  );
}

function MealBuddyCardEntry({ card, highlighted = false, onDelete, onEdit, onUse }: { card: MealBuddyCard; highlighted?: boolean; onDelete: () => void; onEdit: () => void; onUse: () => void }) {
  const title = card.cardType === "restaurant" ? card.restaurantName || "餐廳飯友卡" : card.preferredFoodName || "一張飯友卡";

  return (
    <View nativeID={mealBuddyCardElementId(card)} style={[styles.buddyCardEntry, highlighted && styles.highlightedCard]}>
      <View style={styles.cardEntryHeader}>
        <View style={styles.cardEntryIcon}>
          <Icon name={card.cardType === "restaurant" ? "table4" : "buddies"} size={18} color={snow.primaryDeep} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardEntryTitle}>{title}</Text>
          {card.sourceType === "ai_recommendation" ? <Text style={styles.cardEntrySubtitle}>已放入配對池中</Text> : null}
        </View>
        <PremiumBadge label={mealBuddyCardSourceLabel(card)} variant={card.sourceType === "ai_recommendation" ? "premium" : "free"} />
      </View>
      <Text style={styles.cardEntryMeta}>餐點類型：{card.foodCategory || card.preferredFoodName || "尚未設定"}</Text>
      <Text style={styles.cardEntryMeta}>時間：{card.mealTime || card.preferredTime || "尚未設定"} · 付款偏好：{card.paymentPreference || "AA 制"}</Text>
      <Text style={styles.cardEntryMeta}>營養目標：{card.nutritionGoal || "尚未設定"} · 狀態：{card.visibilityStatus === "active" ? "使用中" : card.visibilityStatus}</Text>
      <View style={styles.cardEntryActions}>
        <PrimaryButton icon="buddies" label="用這張卡找飯友" onPress={onUse} />
        <View style={styles.ctaRow2}>
          <View style={styles.ctaItem}>
            <SecondaryButton icon="edit" label="編輯" onPress={onEdit} />
          </View>
          <View style={styles.ctaItem}>
            <SecondaryButton label="刪除" onPress={onDelete} />
          </View>
        </View>
      </View>
    </View>
  );
}

function mealBuddyCardSourceLabel(card: MealBuddyCard) {
  if (card.sourceType === "ai_recommendation") {
    return "AI 分析卡";
  }
  if (card.cardType === "restaurant") {
    return "餐廳卡";
  }
  return "自訂卡";
}

function CandidateCommunityModal({
  candidate,
  isPremium,
  onChat,
  onClose,
  onEatTogether,
  onInviteTable
}: {
  candidate: RankedMealBuddyCandidate | null;
  isPremium: boolean;
  onChat: () => void;
  onClose: () => void;
  onEatTogether: () => void;
  onInviteTable: () => void;
}) {
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  if (!candidate) {
    return null;
  }
  const profile = getCandidateDisplayProfile(candidate, isPremium ? "premium" : "free");
  const modalCopy = zhTW.mobile.refinedLogic.mealBuddyCard.communityModal;
  const communitySettings = getCommunityCardSettings();
  const displayName = cleanDisplayName(profile.displayName);
  const locationText = isPremium ? candidate.area : `${candidate.area}附近`;
  const distanceText = isPremium ? `距離 ${candidate.distanceKm.toFixed(1)} km` : "距離保護中";
  const paymentTag = candidate.tags.find((tag) => tag.includes("AA") || tag.includes("AB") || tag.includes("請") || tag.includes("付款")) ?? modalCopy.defaultPayment;
  const intentionTag = candidate.intentionType === "chat_first" ? zhTW.mobile.refinedLogic.mealBuddyCard.decideLaterBadge : modalCopy.directEat;
  const matchReasons = candidate.matchReasons.length ? candidate.matchReasons.slice(0, 3) : [modalCopy.defaultReason];
  const compatibility = Math.max(62, Math.min(96, candidate.rankScore));
  const introText = candidate.socialNote || communitySettings.intro || profile.shortBio || modalCopy.defaultIntro;
  const healthGoalTags = communitySettings.selectedHealthTags.length ? communitySettings.selectedHealthTags : [profile.nutritionGoal];
  const foodMemoryTags = [candidate.foodCategory, ...communitySettings.selectedEatingTags].filter(Boolean).slice(0, 4);
  const nutritionSummaryTags = [profile.nutritionGoal, candidate.foodCategory, candidate.preferredTime].filter(Boolean);
  const lifestyleTags = [communitySettings.gatheringStyle, communitySettings.paymentPreference, communitySettings.spicePreference].filter(Boolean);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.socialModalPanel}>
          <ScrollView contentContainerStyle={styles.socialModalContent}>
            <View style={styles.socialHeader}>
              <View style={[styles.socialAvatar, !isPremium && styles.socialMascotAvatar]}>
                <ProfileAvatarImage avatarSource={profile.avatarSource} />
              </View>
              <View style={styles.socialIdentity}>
                <Text style={styles.socialName}>{displayName}</Text>
                <Text style={styles.socialMeta}>{profile.ageText}</Text>
                <Text style={styles.socialMeta}>{locationText}｜{distanceText}</Text>
              </View>
              {candidate.isVerified ? <PremiumBadge label="已驗證" variant="premium" /> : null}
            </View>

            <View style={styles.mealIntentHero}>
              <Text style={styles.intentEyebrow}>{mascotAvatarFor(candidate.foodCategory)} 今天想吃</Text>
              <Text style={styles.mealIntentTitle}>{candidate.preferredFoodName}</Text>
              <View style={styles.intentBadgeRow}>
                <Text style={styles.intentBadge}>{paymentTag}</Text>
                <Text style={styles.intentBadge}>{intentionTag}</Text>
              </View>
            </View>

            <View style={styles.communitySection}>
              <Text style={styles.communitySectionTitle}>自我介紹</Text>
              <Text style={styles.socialIntro}>{introText}</Text>
            </View>

            <View style={styles.communitySection}>
              <Text style={styles.communitySectionTitle}>營養與生活</Text>
              <CommunityChipGroup label="健康目標" values={healthGoalTags} />
              <CommunityChipGroup label="最近餐點風格" values={[profile.recentMealStyle || candidate.foodCategory]} />
              <CommunityChipGroup label="飲食記憶摘要" values={foodMemoryTags} />
              <CommunityChipGroup label="營養目標摘要" values={nutritionSummaryTags} />
            </View>

            <View style={styles.matchReasonCard}>
              <View style={styles.matchReasonHeader}>
                <Text style={styles.matchReasonHeading}>{modalCopy.matchReasonTitle}</Text>
                <Text style={styles.compatibilityPill}>{modalCopy.compatibilityPrefix} {compatibility}%</Text>
              </View>
              <View style={styles.reasonList}>
                {matchReasons.map((reason) => (
                  <Text key={reason} style={styles.reasonBullet}>• {reason}</Text>
                ))}
              </View>
            </View>

            <View style={styles.modalActionRow}>
              <Pressable style={styles.modalOutlineAction} onPress={onChat}>
                <Text style={styles.modalOutlineActionText}>💬 {modalCopy.chatAction}</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryAction} onPress={onEatTogether}>
                <Text style={styles.modalPrimaryActionText}>🍽 {modalCopy.eatAction}</Text>
              </Pressable>
              <Pressable style={styles.modalOutlineAction} onPress={onInviteTable}>
                <Text style={styles.modalOutlineActionText}>👥 {modalCopy.tableAction}</Text>
              </Pressable>
            </View>

            <Pressable style={styles.moreInfoToggle} onPress={() => setShowMoreInfo((value) => !value)}>
              <Text style={styles.moreInfoToggleText}>{showMoreInfo ? modalCopy.collapseInfo : modalCopy.moreInfo}</Text>
            </Pressable>
            {showMoreInfo ? (
              <View style={styles.moreInfoPanel}>
                <InfoLine label={modalCopy.diningStyle} value={profile.diningStyle} />
                <InfoLine label={modalCopy.nutritionGoal} value={profile.nutritionGoal} />
                <InfoLine label={modalCopy.recentMeals} value={profile.recentMealStyle} />
                <InfoLine label={modalCopy.paymentPreference} value={paymentTag} />
                <InfoLine label="聊天偏好" value={intentionTag} />
                <InfoLine label="聚餐風格" value={communitySettings.gatheringStyle} />
                <InfoLine label={modalCopy.safetyReminder} value={modalCopy.safetyText} />
                <TagRow tags={[...profile.tags, ...lifestyleTags].slice(0, 8)} />
              </View>
            ) : null}

            <Pressable style={styles.secondaryButtonWide} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>{modalCopy.close}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CommunityChipGroup({ label, values }: { label: string; values: string[] }) {
  const visibleValues = values.filter(Boolean).slice(0, 4);
  if (visibleValues.length === 0) {
    return null;
  }
  return (
    <View style={styles.communityChipGroup}>
      <Text style={styles.communityChipLabel}>{label}</Text>
      <View style={styles.intentBadgeRow}>
        {visibleValues.map((value) => (
          <Text key={`${label}-${value}`} style={styles.communityChip}>{value}</Text>
        ))}
      </View>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function cleanDisplayName(displayName: string) {
  return displayName.split("｜")[0].split(" ")[0] || displayName;
}

function mascotAvatarFor(category: string) {
  if (category.includes("火鍋")) return "🍲";
  if (category.includes("日式") || category.includes("壽司")) return "🍣";
  if (category.includes("高蛋白") || category.includes("健身")) return "🥗";
  if (category.includes("蔬")) return "🥬";
  if (category.includes("甜點") || category.includes("咖啡")) return "🍰";
  return "🍱";
}

function MyFriendsSection({
  chats,
  focusedChatId,
  focusedChatName,
  friends,
  initialTab,
  invites,
  isPremium,
  onAcceptInvite,
  onChatUpdated,
  onDeclineInvite,
  onDeleteInvite,
  onOpenProfile
}: {
  chats: ReturnType<typeof getMealBuddyChats>;
  focusedChatId: string;
  focusedChatName: string;
  friends: MatchedFriend[];
  initialTab: MyFriendsTab;
  invites: ReturnType<typeof getMealBuddyInvites>;
  isPremium: boolean;
  onAcceptInvite: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onChatUpdated: () => void;
  onDeclineInvite: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onDeleteInvite: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onOpenProfile: (profileId?: string) => void;
}) {
  const [mode, setMode] = useState<"list" | "chat" | "card">("list");
  const [activeTab, setActiveTab] = useState<MyFriendsTab>(initialTab);
  const [selectedFriend, setSelectedFriend] = useState(friends[0]);
  const [selectedChat, setSelectedChat] = useState<ReturnType<typeof getMealBuddyChats>[number] | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<ReturnType<typeof getMealBuddyInvites>[number] | null>(null);
  const [sort, setSort] = useState<FriendSort>("飯局數");
  const [expandedFriendCardId, setExpandedFriendCardId] = useState("");
  const [friendsSubTab, setFriendsSubTab] = useState<"matched" | "invitations">("matched");
  const [friendSearchQuery, setFriendSearchQuery] = useState("");
  const normalizedFriendQuery = friendSearchQuery.trim().toLowerCase();

  useEffect(() => {
    setActiveTab(initialTab);
    if (initialTab === "invitations") {
      setFriendsSubTab("invitations");
      setMode("list");
      setSelectedChat(null);
      return;
    }
    if (initialTab !== "chats") {
      setFriendsSubTab("matched");
      setMode("list");
      setSelectedChat(null);
      return;
    }
    const targetChat = chats.find((chat) => chat.id === focusedChatId) ?? null;
    if (targetChat) {
      setSelectedChat(targetChat);
      const friend = findFriendForChat(friends, targetChat);
      if (friend) {
        setSelectedFriend(friend);
      }
      setMode("chat");
      return;
    }
    setMode("list");
  }, [focusedChatId, focusedChatName, initialTab]);

  const sortedFriends = [...friends].sort((a, b) => {
    if (sort === "飯局數") return b.mealCount - a.mealCount;
    if (sort === "認識時間") return b.knownSince.localeCompare(a.knownSince);
    return b.lastTable.localeCompare(a.lastTable);
  });
  const sortedChats = activeTab === "chats" ? getMealBuddyChats() : chats;
  const visibleInvites = invites.filter((invite) => invite.status === "pending" || invite.direction === "sent");

  if (mode === "chat") {
    const chat = selectedChat ?? chats.find((item) => item.participantProfileId === selectedFriend.profileId);
    return (
      <FriendChatMode
        friend={selectedFriend}
        isPremium={isPremium}
        chat={chat}
        onBack={() => {
          setActiveTab("chats");
          setSelectedChat(null);
          setMode("list");
          onChatUpdated();
        }}
      />
    );
  }

  if (mode === "card") {
    return <FriendCommunityCard friend={selectedFriend} isPremium={isPremium} onBack={() => setMode("list")} />;
  }

  const sectionTab = activeTab === "chats" ? "chats" : "friends";
  const filteredFriends = normalizedFriendQuery
    ? sortedFriends.filter((friend) => {
        const profile = resolveMatchedFriendProfileDisplay(friend);
        return [profile?.displayName, profile?.shortProfileSummary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedFriendQuery);
      })
    : sortedFriends;

  return (
    <>
      {sectionTab === "friends" ? (
        <View style={styles.snowChipRow}>
          <Chip label="已配對" active={friendsSubTab === "matched"} onPress={() => setFriendsSubTab("matched")} />
          <Chip label="邀請中" active={friendsSubTab === "invitations"} onPress={() => setFriendsSubTab("invitations")} />
        </View>
      ) : null}

      {sectionTab === "friends" && friendsSubTab === "matched" ? (
        <>
          <TextInput
            placeholder="搜尋飯友、餐廳或地區"
            placeholderTextColor={snow.faint}
            style={styles.searchInput}
            value={friendSearchQuery}
            onChangeText={setFriendSearchQuery}
          />
          <View style={styles.snowChipRow}>
            {(["飯局數", "認識時間", "最近同桌"] as FriendSort[]).map((item) => (
              <Chip key={item} label={item} active={sort === item} onPress={() => setSort(item)} />
            ))}
          </View>
          <View style={styles.cardList}>
            {filteredFriends.map((friend) => {
              const profile = resolveMatchedFriendProfileDisplay(friend);
              if (expandedFriendCardId === friend.id) {
                return <FriendCommunityCard key={friend.id} friend={friend} isPremium={isPremium} onBack={() => setExpandedFriendCardId("")} />;
              }
              return (
              <View key={friend.id} style={styles.previewCard}>
                <View style={styles.friendHeader}>
                  <View style={styles.avatar}>
                    <MatchedProfileAvatar avatarSource={profile?.avatarSource} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.name}>{profile?.displayName ?? "飯友"}</Text>
                    <Text style={styles.meta}>{profile?.shortProfileSummary ?? ""}</Text>
                  </View>
                  {isPremium && profile?.isPremium ? <PremiumBadge label="已驗證" variant="premium" /> : null}
                </View>
                <TagRow tags={profile?.tags ?? []} />
                <Text style={styles.message}>{isPremium ? `一起吃過 ${friend.mealCount} 次 · 最近同桌：${friend.lastTable}` : profile?.shortProfileSummary ?? "免費版會保護精準距離與附近狀態。"}</Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      onOpenProfile(friend.profileId);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>查看社群卡</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      const chat = chats.find((item) => item.id === friend.chatThreadId || item.participantProfileId === friend.profileId);
                      setSelectedFriend(friend);
                      setSelectedChat(chat ?? createDirectChatFromMatchedBuddy(friend));
                      setMode("chat");
                    }}
                  >
                    <Text style={styles.primaryButtonText}>聊天</Text>
                  </Pressable>
                </View>
              </View>
            );
            })}
          </View>
        </>
      ) : null}

      {sectionTab === "friends" && friendsSubTab === "invitations" ? (
        <View style={styles.cardList}>
          {visibleInvites.length === 0 ? (
            <Card>
              <Text style={styles.limitHint}>目前沒有等待中的邀請。從推薦飯友結果送出聊天或吃飯邀請後，會出現在這裡。</Text>
            </Card>
          ) : null}
            {visibleInvites.map((invite) => {
              const profile = resolveInvitationProfileDisplay(invite);
              const displayName = invitationDisplayName(invite, profile);
              return (
                <View key={invite.id} style={styles.previewCard}>
                  <Text style={styles.meta}>{invite.direction === "received" ? "收到邀請" : "我送出的邀請"} · {invite.type === "chat" ? "先聊聊" : invite.type === "table" ? "四人飯局邀請" : "一起吃飯"}</Text>
                  <PremiumBadge label={invite.demoLabel} variant="free" />
                  <Text style={styles.name}>{invite.type === "table" ? `四人飯局邀請｜${invite.mealName}` : invite.direction === "received" ? `${displayName} 邀請你` : `你邀請 ${displayName}`}</Text>
                  <Text style={styles.message}>{invite.type === "table" ? `${displayName} 邀請你加入四人桌 · 目前 ${invite.currentParticipants ?? 3}/${invite.requiredParticipants ?? 4} 人` : `${invite.mealName} · ${invite.time}`}</Text>
                  <Text style={styles.meta}>{invite.status === "pending" ? "等待回覆" : invite.status === "accepted" ? "已接受" : invite.status === "declined" ? "已拒絕" : "已過期"} · {invite.matchReasons.slice(0, 2).join("、")}</Text>
                  <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryButton} onPress={() => setSelectedInvite(invite)}>
                      <Text style={styles.secondaryButtonText}>查看詳情</Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => {
                        onOpenProfile(invite.profileId);
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>查看社群卡</Text>
                    </Pressable>
                    {invite.direction === "received" && invite.status === "pending" ? (
                      <>
                        <Pressable style={styles.primaryButton} onPress={() => onAcceptInvite(invite)}>
                          <Text style={styles.primaryButtonText}>{invite.type === "table" ? "接受邀請" : "接受"}</Text>
                        </Pressable>
                        <Pressable style={styles.secondaryButton} onPress={() => onDeclineInvite(invite)}>
                          <Text style={styles.secondaryButtonText}>{invite.type === "table" ? "婉拒" : "拒絕"}</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable style={styles.secondaryButton} onPress={() => onDeleteInvite(invite)}>
                        <Text style={styles.secondaryButtonText}>{invite.status === "declined" ? "刪除" : "取消邀請"}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
      ) : null}

      {sectionTab === "chats" ? (
        <>
          <SnowSectionHeader title="聊天" subtitle="顯示目前已建立的聊天室列表。" />
          <View style={styles.cardList}>
            {sortedChats.map((chat) => {
              const profile = resolveChatProfileDisplay(chat);
              const displayName = chatDisplayName(chat, profile);
              const summary = chatSummaryText(chat, profile);
              return (
                <View key={chat.id} style={styles.previewCard}>
                  <View style={styles.friendHeader}>
                    <View style={styles.avatar}>
                      <ChatProfileAvatar avatarSource={profile?.avatarSource} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.meta}>{chat.unread ? "新訊息" : "聊天"}{profile?.isPremium ? " · Premium" : ""}</Text>
                      <Text style={styles.name}>{displayName}</Text>
                      {summary ? <Text style={styles.message}>{summary}</Text> : null}
                    </View>
                  </View>
                  {profile?.tags.length ? <TagRow tags={profile.tags} /> : null}
                  <Text style={styles.message}>{chat.lastMessage}</Text>
                  <Text style={styles.meta}>{chat.time}</Text>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      const friend = findFriendForChat(friends, chat) ?? createFriendFromChat(chat);
                      setSelectedFriend(friend);
                      setSelectedChat(chat);
                      setMode("chat");
                    }}
                  >
                    <Text style={styles.primaryButtonText}>進入聊天</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <InvitationDetailModal invite={selectedInvite} onAccept={onAcceptInvite} onClose={() => setSelectedInvite(null)} onDecline={onDeclineInvite} onDelete={onDeleteInvite} />
    </>
  );
}

function InvitationDetailModal({
  invite,
  onAccept,
  onClose,
  onDecline,
  onDelete
}: {
  invite: ReturnType<typeof getMealBuddyInvites>[number] | null;
  onAccept: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onClose: () => void;
  onDecline: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onDelete: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
}) {
  if (!invite) {
    return null;
  }
  const profile = resolveInvitationProfileDisplay(invite);
  const displayName = invitationDisplayName(invite, profile);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <SectionTitle title="邀請詳情" subtitle={`${invite.direction === "received" ? "收到邀請" : "我送出的邀請"} · ${invite.type === "chat" ? "先聊聊" : "一起吃飯"}`} />
            <View style={styles.previewCard}>
              <Text style={styles.meta}>邀請狀態</Text>
              <PremiumBadge label={invite.demoLabel} variant="free" />
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.message}>{invite.mealName} · {invite.time}</Text>
              <Text style={styles.meta}>{invite.status === "pending" ? "等待回覆" : invite.status === "accepted" ? "已接受" : invite.status === "declined" ? "已拒絕" : "已過期"}</Text>
            </View>
            <InviteCardSummary title="對方使用的飯友卡" card={invite.inviterCard} />
            <InviteCardSummary title="與你配對的飯友卡" card={invite.matchedInviteeCard} />
            <View style={styles.previewCard}>
              <Text style={styles.name}>配對原因</Text>
              {invite.matchReasons.map((reason) => (
                <Text key={reason} style={styles.message}>• {reason}</Text>
              ))}
            </View>
            <View style={styles.actionRow}>
              {invite.direction === "received" && invite.status === "pending" ? (
                <>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => {
                      onAccept(invite);
                      onClose();
                    }}
                  >
                    <Text style={styles.primaryButtonText}>{invite.type === "chat" ? "接受並聊天" : "接受飯局"}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => {
                      onDecline(invite);
                      onClose();
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>拒絕</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    onDelete(invite);
                    onClose();
                  }}
                >
                  <Text style={styles.secondaryButtonText}>{invite.status === "declined" ? "刪除" : "取消邀請"}</Text>
                </Pressable>
              )}
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>關閉</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InviteCardSummary({ card, title }: { card: MealBuddyCard; title: string }) {
  return (
    <View style={styles.previewCard}>
      <Text style={styles.meta}>{title}</Text>
      <Text style={styles.name}>{card.preferredFoodName || card.restaurantName || "飯友卡"}</Text>
      <Text style={styles.message}>{card.restaurantName || "未指定餐廳"} · {card.preferredTime || "尚未設定時間"}</Text>
      <TagRow tags={[mealBuddyCardSourceLabel(card), card.foodCategory, card.area, card.nutritionGoal].filter(Boolean)} />
    </View>
  );
}

function FriendChatMode({
  chat,
  friend,
  isPremium,
  onBack
}: {
  chat?: ReturnType<typeof getMealBuddyChats>[number] | null;
  friend: MatchedFriend;
  isPremium: boolean;
  onBack: () => void;
}) {
  const [draftMessage, setDraftMessage] = useState("");
  const [localChatVersion, setLocalChatVersion] = useState(0);
  const isGroupChat = Boolean(chat?.id.includes("group"));
  const liveChat = chat?.id ? getMealBuddyChats().find((item) => item.id === chat.id) ?? chat : chat;
  const chatProfile = resolveChatProfileDisplay(liveChat) ?? resolveCommunityProfileDisplay(friend.profileId);
  const title = chatProfile?.displayName ?? (isGroupChat ? liveChat?.userName ?? "四人桌群聊" : "飯友");
  const subtitle = isGroupChat ? "四人桌成桌後的群聊，用來確認集合時間與餐廳細節。" : chatProfile?.shortProfileSummary ?? "";
  const threadMessages = liveChat?.messages?.length ? liveChat.messages : [{ id: `preview-${localChatVersion}`, text: liveChat?.lastMessage ?? "想一起聊聊這餐嗎？", sender: "buddy" as const }];

  return (
    <Card tone="mint">
      <SectionTitle title={`${title} 的聊天`} subtitle={subtitle} />
      {chatProfile?.tags.length ? <TagRow tags={chatProfile.tags} /> : null}
      <Text style={styles.meta}>{liveChat?.time ?? "剛剛"}</Text>
      {threadMessages.map((message) => (
        <View key={message.id} style={[styles.chatBubble, message.sender === "me" && styles.myChatBubble]}>
          <Text style={styles.message}>{message.text}</Text>
        </View>
      ))}
      <View style={styles.inputRow}>
        <TextInput placeholder="輸入訊息" placeholderTextColor={colors.muted} style={styles.input} value={draftMessage} onChangeText={setDraftMessage} />
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            const message = draftMessage.trim() || "想一起聊聊這餐嗎？";
            if (chat?.id) {
              addMealBuddyChatMessage(chat.id, message);
              setLocalChatVersion((version) => version + 1);
            }
            setDraftMessage("");
          }}
        >
          <Text style={styles.primaryButtonText}>送出</Text>
        </Pressable>
      </View>
      <Pressable style={styles.secondaryButtonWide} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>← 返回聊天列表</Text>
      </Pressable>
    </Card>
  );
}

function findFriendForChat(friends: MatchedFriend[], chat: ReturnType<typeof getMealBuddyChats>[number]) {
  return friends.find((friend) => chat.participantProfileId === friend.profileId);
}

function createDirectChatFromMatchedBuddy(friend: MatchedFriend): ReturnType<typeof getMealBuddyChats>[number] {
  const profileId = friend.profileId;
  return {
    id: friend.chatThreadId,
    userName: profileId,
    lastMessage: "這是飯友聊天室，可以從這裡確認餐點與時間。",
    relatedMeal: "",
    time: "剛剛",
    unread: true,
    demoLabel: "測試資料",
    participantProfileId: profileId,
    threadType: "direct"
  };
}

function createFriendFromChat(chat: ReturnType<typeof getMealBuddyChats>[number]): MatchedFriend {
  const profileId = chat.participantProfileId ?? "";
  const id = profileId || chat.id;
  return {
    id,
    profileId,
    mealCount: 1,
    knownSince: "2026/06/01",
    lastTable: "今天",
    chatThreadId: chat.id
  };
}
function FriendCommunityCard({ friend, isPremium, onBack }: { friend: MatchedFriend; isPremium: boolean; onBack: () => void }) {
  const profile = resolveMatchedFriendProfileDisplay(friend);
  return (
    <Card tone="premium">
      <View style={styles.friendHeader}>
        <View style={styles.avatarLarge}>
          <MatchedProfileAvatar avatarSource={profile?.avatarSource} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{profile?.displayName ?? "飯友"}</Text>
          <Text style={styles.meta}>{profile?.shortProfileSummary ?? ""}</Text>
        </View>
      </View>
      <TagRow tags={profile?.tags ?? []} />
      <Text style={styles.message}>個人摘要：{profile?.shortProfileSummary ?? ""}</Text>
      <Text style={styles.message}>{isPremium ? `一起吃過 ${friend.mealCount} 次 · 最近同桌：${friend.lastTable}` : profile?.shortProfileSummary ?? ""}</Text>
      <Text style={styles.message}>{isPremium ? `最近同桌：${friend.lastTable}` : profile?.shortProfileSummary ?? ""}</Text>
      <Pressable style={styles.secondaryButtonWide} onPress={onBack}>
        <Text style={styles.secondaryButtonText}>返回我的飯友</Text>
      </Pressable>
    </Card>
  );
}

type GatheringTab = "ongoing" | "inviting" | "ended";
function GatheringsSection({
  acceptedInvite,
  invites,
  onAcceptInvite,
  onDeclineInvite,
  onOpenChat,
  onOpenProfile
}: {
  acceptedInvite: ReturnType<typeof getMealBuddyInvites>[number] | null;
  invites: ReturnType<typeof getMealBuddyInvites>;
  onAcceptInvite: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onDeclineInvite: (invite: ReturnType<typeof getMealBuddyInvites>[number]) => void;
  onOpenChat: (record: GatheringRecord) => void;
  onOpenProfile: (profileId?: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<GatheringTab>("ongoing");
  const [selectedRecord, setSelectedRecord] = useState<GatheringRecord | null>(() => acceptedInvite ? mealEventFromInvite(acceptedInvite) : null);
  const [detailInvite, setDetailInvite] = useState<ReturnType<typeof getMealBuddyInvites>[number] | null>(null);
  const [communityInvite, setCommunityInvite] = useState<ReturnType<typeof getMealBuddyInvites>[number] | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GatheringRecord | null>(null);
  const incomingMealInvites = invites.filter((invite) => (invite.type === "meal" || invite.type === "table") && invite.direction === "received" && invite.status === "pending");
  const sentMealInvites = invites.filter((invite) => (invite.type === "meal" || invite.type === "table") && invite.direction === "sent");
  const acceptedReceivedMealInvites = invites.filter((invite) => (invite.type === "meal" || invite.type === "table") && invite.direction === "received" && invite.status === "accepted");
  const joinedInviteRecords = acceptedReceivedMealInvites.map(mealEventFromInvite);
  const selectedRecordInvite = selectedRecord ? acceptedReceivedMealInvites.find((invite) => `accepted-${invite.id}` === selectedRecord.id) ?? null : null;

  useEffect(() => {
    if (!acceptedInvite) {
      return;
    }
    const acceptedRecord = mealEventFromInvite(acceptedInvite);
    setActiveTab("ongoing");
    setSelectedRecord(acceptedRecord);
    focusElementAfterRender(mealEventElementId(acceptedRecord.id));
  }, [acceptedInvite]);

  return (
    <>
      <View style={styles.snowChipRow}>
        {([
          { id: "ongoing", label: "進行中" },
          { id: "inviting", label: "邀請中" },
          { id: "ended", label: "已結束" }
        ] as Array<{ id: GatheringTab; label: string }>).map((item) => (
          <Chip key={item.id} label={item.label} active={activeTab === item.id} onPress={() => setActiveTab(item.id)} />
        ))}
      </View>

      {activeTab === "ongoing" ? (
        <>
          <GatheringCategory
            title="我開的飯局"
            records={gatheringRecords.hosting}
            selectedRecord={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            onOpen={setSelectedRecord}
            onOpenChat={onOpenChat}
            onCancel={setCancelTarget}
            onViewInviteDetail={() => null}
          />
          <GatheringCategory
            title="我加入的飯局"
            records={[...joinedInviteRecords, ...gatheringRecords.joined]}
            selectedRecord={selectedRecord}
            sourceInvite={selectedRecordInvite}
            onClose={() => setSelectedRecord(null)}
            onOpen={setSelectedRecord}
            onOpenChat={onOpenChat}
            onCancel={setCancelTarget}
            onViewInviteDetail={() => selectedRecordInvite ? setDetailInvite(selectedRecordInvite) : null}
          />
        </>
      ) : null}

      {activeTab === "inviting" ? (
        <>
          <Card>
            <SectionTitle title="我收到的邀請" subtitle="只顯示等待回覆的飯局邀請，詳情可點進去看。" />
            <View style={styles.cardList}>
              {incomingMealInvites.length === 0 ? <Text style={styles.limitHint}>目前沒有收到新的飯局邀請。</Text> : null}
              {incomingMealInvites.map((invite) => (
                <InvitationSummaryCard key={invite.id} invite={invite} onAccept={() => onAcceptInvite(invite)} onCommunity={() => onOpenProfile(invite.profileId)} onDecline={() => onDeclineInvite(invite)} onDetail={() => setDetailInvite(invite)} />
              ))}
            </View>
          </Card>
          <Card>
            <SectionTitle title="我寄出的邀請" subtitle="你送出的飯局邀請會在這裡追蹤狀態。" />
            <View style={styles.cardList}>
              {sentMealInvites.length === 0 ? <Text style={styles.limitHint}>目前沒有寄出的飯局邀請。</Text> : null}
              {sentMealInvites.map((invite) => (
                <InvitationSummaryCard key={invite.id} invite={invite} onAccept={() => onAcceptInvite(invite)} onCommunity={() => onOpenProfile(invite.profileId)} onDecline={() => onDeclineInvite(invite)} onDetail={() => setDetailInvite(invite)} />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      {activeTab === "ended" ? (
        <Card>
          <SectionTitle title="已結束飯局" subtitle="過去、取消與過期的飯局會收在這裡。" />
          <View style={styles.cardList}>
            {gatheringRecords.ended.map((record) => (
              <View key={record.id} style={styles.previewCard}>
                <Text style={styles.name}>{record.name}</Text>
                <Text style={styles.message}>{record.location}｜{record.people}</Text>
                <Text style={styles.meta}>{record.status}</Text>
                <View style={styles.actionRow}>
                  <Pressable style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>查看紀錄</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>再開一次</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <InvitationDetailModal
        invite={detailInvite}
        onAccept={(invite) => {
          onAcceptInvite(invite);
          setDetailInvite(null);
        }}
        onClose={() => setDetailInvite(null)}
        onDecline={(invite) => {
          onDeclineInvite(invite);
          setDetailInvite(null);
        }}
        onDelete={() => setDetailInvite(null)}
      />
      <InviteCommunityModal invite={communityInvite} onClose={() => setCommunityInvite(null)} />
      <CancelMealEventModal
        record={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onSubmit={(record, reason) => {
          const isGroupTable = record.source === "group_table" || record.people.includes("4");
          addMealBuddyChatSystemMessage({
            chatUserName: isGroupTable ? undefined : record.participantProfileId,
            groupTableName: isGroupTable ? record.name : undefined,
            reason,
            relatedMeal: record.name
          });
          setCancelTarget(null);
          onOpenChat(record);
        }}
      />
    </>
  );
}

function GatheringCategory({
  onClose,
  onCancel,
  onOpen,
  onOpenChat,
  onViewInviteDetail,
  records,
  selectedRecord,
  sourceInvite,
  title
}: {
  onClose: () => void;
  onCancel: (record: GatheringRecord) => void;
  onOpen: (record: GatheringRecord) => void;
  onOpenChat: (record: GatheringRecord) => void;
  onViewInviteDetail: () => void;
  records: GatheringRecord[];
  selectedRecord: GatheringRecord | null;
  sourceInvite?: ReturnType<typeof getMealBuddyInvites>[number] | null;
  title: string;
}) {
  return (
    <Card>
      <SectionTitle title={title} subtitle={title === "我開的飯局" ? "你建立或管理中的飯局。" : "你已加入或被邀請成功的飯局。"} />
      <View style={styles.cardList}>
        {records.map((record) => {
          return selectedRecord?.id === record.id ? (
            <View key={record.id} nativeID={mealEventElementId(record.id)}>
              <MealEventDetail invite={sourceInvite?.id === record.id.replace("accepted-", "") ? sourceInvite : sourceInvite && record.id.startsWith("accepted-") ? sourceInvite : null} record={record} onBack={onClose} onCancel={() => onCancel(record)} onOpenChat={onOpenChat} onViewInviteDetail={onViewInviteDetail} />
            </View>
          ) : (
            <View key={record.id} nativeID={mealEventElementId(record.id)} style={styles.previewCard}>
              <View style={styles.badgeRow}>
                <PremiumBadge label={mealEventTypeLabel(record)} variant={record.source === "group_table" ? "premium" : "free"} />
              </View>
              <Text style={styles.name}>{record.name}</Text>
              <Text style={styles.message}>{record.location}｜{record.time}</Text>
              <Text style={styles.meta}>{record.people}｜{record.status}</Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.primaryButton} onPress={() => onOpen(record)}>
                  <Text style={styles.primaryButtonText}>查看飯局</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => onOpenChat(record)}>
                  <Text style={styles.secondaryButtonText}>聊天</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function InvitationSummaryCard({ invite, onAccept, onCommunity, onDecline, onDetail }: { invite: ReturnType<typeof getMealBuddyInvites>[number]; onAccept: () => void; onCommunity: () => void; onDecline: () => void; onDetail: () => void }) {
  const typeLabel = invitationTypeLabel(invite.type);
  const isTableInvite = invite.type === "table";
  const profile = resolveInvitationProfileDisplay(invite);
  const displayName = invitationDisplayName(invite, profile);
  const participantText = isTableInvite ? `目前 ${invite.currentParticipants ?? 3} / ${invite.requiredParticipants ?? 4} 人` : "";
  return (
    <View style={styles.previewCard}>
      <Text style={styles.meta}>{invite.direction === "received" ? "收到邀請" : "我寄出的邀請"} · {invite.status === "pending" ? "等待回覆" : invite.status === "declined" ? "已拒絕" : invite.status === "expired" ? "已過期" : "已接受"}</Text>
      <PremiumBadge label={invite.demoLabel} variant="free" />
      <Text style={styles.name}>{isTableInvite ? `四人飯局邀請｜${invite.mealName}` : invite.direction === "received" ? `${displayName} 邀請你${typeLabel}` : `你邀請 ${displayName}${typeLabel}`}</Text>
      <Text style={styles.message}>{isTableInvite ? `${displayName} 邀請你加入四人桌` : `${invite.mealName}｜${invite.time}`}</Text>
      {isTableInvite ? <Text style={styles.meta}>{invite.restaurantName ?? invite.inviterCard.restaurantName}｜{invite.time}｜{participantText}｜{tableInviteStatusLabel(invite.tableStatus)}</Text> : null}
      <Text style={styles.meta}>{invite.matchReasons.slice(0, 2).join("、")}</Text>
      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={onDetail}>
          <Text style={styles.secondaryButtonText}>查看詳情</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCommunity}>
          <Text style={styles.secondaryButtonText}>查看社群卡</Text>
        </Pressable>
        {invite.direction === "received" ? (
          <>
            <Pressable style={styles.primaryButton} onPress={onAccept}>
              <Text style={styles.primaryButtonText}>{isTableInvite ? "接受邀請" : "接受"}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onDecline}>
              <Text style={styles.secondaryButtonText}>{isTableInvite ? "婉拒" : "拒絕"}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{invite.status === "declined" ? "刪除" : "取消邀請"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function tableInviteStatusLabel(status: ReturnType<typeof getMealBuddyInvites>[number]["tableStatus"]) {
  if (status === "formed") {
    return "已成團";
  }
  if (status === "accepted") {
    return "已接受";
  }
  if (status === "declined") {
    return "已婉拒";
  }
  return "等待回覆";
}

function invitationTypeLabel(type: ReturnType<typeof getMealBuddyInvites>[number]["type"]) {
  if (type === "chat") {
    return "先聊聊";
  }
  if (type === "table") {
    return "加入4人桌";
  }
  return "一起吃飯";
}

function InviteCommunityModal({ invite, onClose }: { invite: ReturnType<typeof getMealBuddyInvites>[number] | null; onClose: () => void }) {
  if (!invite) {
    return null;
  }
  const profile = resolveInvitationProfileDisplay(invite);
  const displayName = invitationDisplayName(invite, profile);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <SectionTitle title="社群卡預覽" subtitle="來自飯局邀請的飯友資料。" />
            <View style={styles.friendHeader}>
              <View style={styles.avatarLarge}>
                <InvitationAvatar avatarSource={profile?.avatarSource} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>{displayName}</Text>
                <Text style={styles.meta}>{profile?.shortProfileSummary}</Text>
              </View>
            </View>
            <PremiumBadge label={invite.demoLabel} variant="free" />
            <TagRow tags={profile?.tags ?? []} />
            <Text style={styles.message}>今天想吃：{invite.mealName}</Text>
            <Text style={styles.message}>配對原因：{invite.matchReasons.join("、")}</Text>
            <Pressable style={styles.secondaryButtonWide} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>關閉</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InvitationAvatar({ avatarSource }: { avatarSource?: AvatarSource }) {
  return <ProfileAvatarImage avatarSource={avatarSource} />;
}

function ChatProfileAvatar({ avatarSource }: { avatarSource?: AvatarSource }) {
  return <ProfileAvatarImage avatarSource={avatarSource} />;
}

function MatchedProfileAvatar({ avatarSource }: { avatarSource?: AvatarSource }) {
  return <ProfileAvatarImage avatarSource={avatarSource} />;
}

function ProfileAvatarImage({ avatarSource }: { avatarSource?: AvatarSource }) {
  if (avatarSource?.type === "photo" && avatarSource.photoUrl) {
    return <Image source={{ uri: avatarSource.photoUrl }} style={styles.avatarFill} resizeMode="cover" />;
  }

  if (avatarSource?.type === "mascot") {
    const source = getMascotSource(avatarSource.mascotId);
    if (source) {
      return <Image source={source} style={styles.avatarFill} resizeMode="cover" />;
    }
  }

  if (avatarSource?.type === "initial") {
    return <Text style={styles.avatarText}>{avatarSource.value}</Text>;
  }

  return null;
}

function MealEventDetail({ invite, onBack, onCancel, onOpenChat, onViewInviteDetail, record }: { invite: ReturnType<typeof getMealBuddyInvites>[number] | null; onBack: () => void; onCancel: () => void; onOpenChat: (record: GatheringRecord) => void; onViewInviteDetail: () => void; record: GatheringRecord }) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<RankedMealBuddyCandidate | null>(null);
  const isGroupTable = record.source === "group_table" || record.people.includes("4");
  const matchReasons = invite?.matchReasons.slice(0, 3).join("、") || (record.source === "meal_session" ? "餐點偏好與用餐時段接近" : "");
  const participantProfiles = isGroupTable ? getMockTableParticipantCandidates(record.tableId) : [];
  return (
    <Card tone="mint">
      <View style={styles.badgeRow}>
        <PremiumBadge label={mealEventTypeLabel(record)} variant={isGroupTable ? "premium" : "free"} />
      </View>
      <SectionTitle title={`${record.name} 詳情`} subtitle={isGroupTable ? "四人桌會顯示桌主、人數與餐桌狀態。" : "一般飯友飯局會顯示邀請人、配對卡與聊天室。"} />
      <View style={styles.summaryGrid}>
        <SummaryPill label="飯局類型" value={isGroupTable ? "四人桌" : "一般飯友飯局"} />
        <SummaryPill label={isGroupTable ? "桌主 / 飯友" : "一起吃飯的人"} value={gatheringPersonText(record, invite)} />
        <SummaryPill label="餐廳 / 地點" value={record.location} />
        <SummaryPill label="時間" value={record.time} />
        <SummaryPill label="參加者" value={record.people} />
        <SummaryPill label="狀態" value={record.status} />
        <SummaryPill label="付款偏好" value={record.payment} />
        <SummaryPill label="開始方式" value={record.source} />
      </View>
      <Text style={styles.message}>{isGroupTable ? `餐桌參加者：我、${gatheringPersonText(record, invite)}` : `飯友：我、${gatheringPersonText(record, invite)}`}</Text>
      <Text style={styles.message}>備註：{isGroupTable ? "四人桌成桌後會開啟群聊確認細節。" : "一般飯友飯局會沿用一對一聊天室。"}</Text>
      {matchReasons ? <Text style={styles.message}>配對原因：{matchReasons}</Text> : null}
      {showParticipants ? (
        <View style={styles.cardList}>
          {participantProfiles.map((participant) => (
            <Pressable key={participant.userId} style={styles.previewCard} onPress={() => setSelectedParticipant(participant)}>
              <View style={styles.friendHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{mascotAvatarFor(participant.foodCategory)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{participant.displayName}</Text>
                  <Text style={styles.meta}>25–34歲｜{participant.area}｜距離 {participant.distanceKm.toFixed(1)} km</Text>
                </View>
              </View>
              <Text style={styles.message}>今天想吃：{participant.preferredFoodName}</Text>
              <Text style={styles.meta}>{participant.socialNote}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {invite ? (
        <View style={styles.previewCard}>
          <Text style={styles.meta}>來自飯友邀請</Text>
          <Text style={styles.name}>{gatheringPersonText(record, invite)} 的邀請</Text>
          <Text style={styles.message}>使用的飯友卡：{invite.inviterCard.preferredFoodName || invite.inviterCard.restaurantName || "飯友卡"}</Text>
          <Text style={styles.message}>你被配到的飯友卡：{invite.matchedInviteeCard.preferredFoodName || invite.matchedInviteeCard.restaurantName || "飯友卡"}</Text>
          <Text style={styles.meta}>配對原因：{invite.matchReasons.slice(0, 3).join("、")}</Text>
          <Pressable style={styles.secondaryButtonWide} onPress={onViewInviteDetail}>
            <Text style={styles.secondaryButtonText}>查看邀請詳情</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.actionRow}>
        {isGroupTable ? <Pressable style={styles.secondaryButton} onPress={() => setShowParticipants((value) => !value)}>
          <Text style={styles.secondaryButtonText}>查看參加者社群卡</Text>
        </Pressable> : null}
        <Pressable style={styles.primaryButton} onPress={() => onOpenChat(record)}>
          <Text style={styles.primaryButtonText}>{isGroupTable ? "飯局聊天室" : "聊天"}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>取消參加</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>返回</Text>
        </Pressable>
      </View>
      <CandidateCommunityModal
        candidate={selectedParticipant}
        isPremium
        onChat={() => onOpenChat(record)}
        onClose={() => setSelectedParticipant(null)}
        onEatTogether={() => onOpenChat(record)}
        onInviteTable={() => onOpenChat(record)}
      />
    </Card>
  );
}

function CancelMealEventModal({
  onClose,
  onSubmit,
  record
}: {
  onClose: () => void;
  onSubmit: (record: GatheringRecord, reason: string) => void;
  record: GatheringRecord | null;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (record) {
      setReason("");
    }
  }, [record]);

  if (!record) {
    return null;
  }

  const trimmedReason = reason.trim();

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <SectionTitle title="取消參加飯局" subtitle={`請填寫取消「${record.name}」的原因，系統會同步到相關聊天室。`} />
            <TextInput
              multiline
              placeholder="例如：臨時有事"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.reasonInput]}
              value={reason}
              onChangeText={setReason}
            />
            {!trimmedReason ? <Text style={styles.limitHint}>取消理由必填。</Text> : null}
            <View style={styles.actionRow}>
              <Pressable style={[styles.primaryButton, !trimmedReason && styles.disabledButton]} disabled={!trimmedReason} onPress={() => onSubmit(record, trimmedReason)}>
                <Text style={styles.primaryButtonText}>送出取消</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>先不要</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function mealEventTypeLabel(record: GatheringRecord) {
  return record.source === "group_table" || record.people.includes("4") ? "四人桌" : "一般飯友飯局";
}

function mealEventElementId(recordId: string) {
  return `meal-event-${recordId}`;
}

function gatheringPersonText(record: GatheringRecord, invite?: ReturnType<typeof getMealBuddyInvites>[number] | null) {
  if (record.participantProfileId) {
    return resolveCommunityProfileDisplay(record.participantProfileId).displayName;
  }
  if (record.participantProfileIds?.length) {
    return record.participantProfileIds.map((profileId) => resolveCommunityProfileDisplay(profileId).displayName).join("、");
  }
  if (invite?.profileId) {
    return resolveCommunityProfileDisplay(invite.profileId).displayName;
  }
  return "飯友";
}

function mealEventFromInvite(invite: ReturnType<typeof getMealBuddyInvites>[number]): GatheringRecord {
  const inviteProfileName = invite.profileId ? resolveCommunityProfileDisplay(invite.profileId).displayName : "飯友";
  if (invite.type === "table") {
    return {
      id: `accepted-${invite.id}`,
      name: invite.tableName ?? `四人桌｜${invite.mealName}`,
      location: invite.restaurantName || invite.inviterCard.restaurantName || invite.inviterCard.area || "待確認地點",
      time: invite.time,
      people: `${invite.currentParticipants ?? invite.requiredParticipants ?? 4}/${invite.requiredParticipants ?? 4} 人`,
      status: invite.tableStatus === "formed" ? "已成團" : "已接受",
      payment: "AA 制",
      source: "四人桌" as GatheringRecord["source"],
      hostProfileId: invite.profileId,
      participantProfileIds: invite.profileId ? [invite.profileId] : [],
      tableId: invite.tableId,
      chatThreadId: "chat-group-table-balanced-dinner",
      chatName: invite.tableName ?? `四人桌｜${invite.mealName}`,
      notes: "來自四人飯局邀請的測試資料。",
      matchReasons: invite.matchReasons
    };
  }
  return {
    id: `accepted-${invite.id}`,
    name: `和 ${inviteProfileName} 的${invite.mealName}`,
    location: invite.inviterCard.restaurantName || invite.inviterCard.area || "待確認地點",
    time: invite.time,
    people: "2人",
    status: "已確認",
    payment: "AA 制",
    source: "飯友邀請" as GatheringRecord["source"],
    buddyId: invite.profileId,
    participantProfileId: invite.profileId,
    chatName: invite.profileId,
    chatThreadId: `chat-direct-${invite.profileId ?? invite.id}`,
    notes: "來自飯友邀請的測試資料。",
    matchReasons: invite.matchReasons
  };
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryPill}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.mint,
    borderRadius: 999,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  avatarLarge: {
    alignItems: "center",
    backgroundColor: colors.mint,
    borderRadius: 999,
    height: 58,
    justifyContent: "center",
    width: 58
  },
  avatarFill: {
    borderRadius: 999,
    height: "100%",
    width: "100%"
  },
  avatarText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  buddyCardEntry: {
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    padding: 14,
    ...shadows.soft
  },
  cardGroup: {
    gap: 10,
    marginTop: 16
  },
  cardList: {
    gap: 10
  },
  chatBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#ffffff",
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    maxWidth: 420,
    padding: 14
  },
  counterText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginTop: 14
  },
  emptyCard: {
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.72)",
    gap: 10,
    padding: 14
  },
  filterButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  flex: {
    flex: 1
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4
  },
  friendHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  formField: {
    flexGrow: 1,
    flexBasis: 220,
    gap: 6
  },
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  formLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 12
  },
  groupTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  groupHeader: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.72)",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  highlightedCard: {
    borderColor: hexA(snow.primary, 0.4),
    backgroundColor: snow.primarySoft
  },
  highlightedResultGroup: {
    borderColor: colors.coral,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "rgba(249, 242, 234, 0.5)",
    padding: 4
  },
  compactResultHeader: {
    gap: 4,
    paddingHorizontal: 4,
    paddingTop: 4
  },
  inlineForm: {
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.78)",
    marginTop: 16,
    padding: 14
  },
  input: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    minWidth: 180,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  reasonInput: {
    flex: 0,
    minHeight: 96,
    textAlignVertical: "top"
  },
  disabledButton: {
    opacity: 0.45
  },
  inputRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  inlineChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  limitHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20
  },
  message: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(34, 29, 24, 0.34)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  modalContent: {
    gap: 12,
    padding: 16
  },
  modalPanel: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    maxHeight: "86%",
    maxWidth: 560,
    overflow: "hidden",
    width: "100%"
  },
  socialModalPanel: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 30,
    borderWidth: 1,
    maxHeight: "88%",
    maxWidth: 540,
    overflow: "hidden",
    shadowColor: "#2d2823",
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    width: "100%"
  },
  socialModalContent: {
    gap: 14,
    padding: 18
  },
  socialHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14
  },
  socialAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 34,
    borderWidth: 3,
    backgroundColor: colors.teal,
    height: 68,
    width: 68
  },
  socialMascotAvatar: {
    backgroundColor: "#F9F2EA"
  },
  socialAvatarText: {
    fontSize: 32,
    fontWeight: "900"
  },
  socialIdentity: {
    flex: 1,
    gap: 4
  },
  socialName: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  socialMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  mealIntentHero: {
    gap: 10,
    borderColor: "rgba(255,255,255,0.82)",
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 16
  },
  intentEyebrow: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "900"
  },
  mealIntentTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 31
  },
  intentBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  intentBadge: {
    borderRadius: 999,
    backgroundColor: colors.mint,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  socialIntro: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22
  },
  communitySection: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.62)",
    padding: 14
  },
  communitySectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  },
  communityChipGroup: {
    gap: 6
  },
  communityChipLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  communityChip: {
    borderRadius: 999,
    backgroundColor: "#F9F2EA",
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  matchReasonCard: {
    gap: 10,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.62)",
    padding: 14
  },
  matchReasonHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8
  },
  matchReasonHeading: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  compatibilityPill: {
    borderRadius: 999,
    backgroundColor: "#F9F2EA",
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  reasonList: {
    gap: 6
  },
  reasonBullet: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20
  },
  modalActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  modalPrimaryAction: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  modalPrimaryActionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  modalOutlineAction: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  modalOutlineActionText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  moreInfoToggle: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  moreInfoToggleText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  moreInfoPanel: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.5)",
    padding: 12
  },
  infoLine: {
    gap: 3
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900"
  },
  infoValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  myChatBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#F9F2EA"
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  name: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  previewCard: {
    borderColor: snow.line,
    borderRadius: radius.base,
    borderWidth: 1,
    backgroundColor: snow.card,
    gap: 10,
    padding: 14,
    ...shadows.soft
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryButtonWide: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  summaryPill: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    flexGrow: 1,
    flexBasis: 130,
    padding: 12
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 5
  },
  statusChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  tabButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  tabButtonActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  tabButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  tabButtonTextActive: {
    color: colors.ink
  },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  searchInput: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.bg2,
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.medium,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12
  },
  snowChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  ctaRow2: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10
  },
  ctaItem: {
    flex: 1
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  statusEntry: {
    flex: 1,
    minWidth: 70,
    alignItems: "center",
    gap: 6,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: snow.line,
    backgroundColor: snow.card,
    paddingVertical: 12,
    ...shadows.soft
  },
  statusEntryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: snow.primarySoft
  },
  statusEntryDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: snow.accent,
    borderWidth: 1.5,
    borderColor: snow.card
  },
  statusEntryValue: {
    color: snow.ink,
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  statusEntryLabel: {
    color: snow.sub,
    fontSize: 11.5,
    fontFamily: fonts.body
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14
  },
  compareRowDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: snow.line
  },
  compareIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: snow.primarySoft
  },
  compareTextWrap: {
    flex: 1,
    gap: 2
  },
  compareTitle: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  compareDesc: {
    color: snow.sub,
    fontSize: 12,
    fontFamily: fonts.body,
    lineHeight: 17
  },
  compareCta: {
    marginTop: 14
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16
  },
  groupTitleSnow: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  emptyState: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 8,
    marginTop: 12
  },
  emptyStateTitle: {
    color: snow.ink,
    fontSize: 14,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  emptyStateBody: {
    color: snow.sub,
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 18,
    textAlign: "center"
  },
  cardEntryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  cardEntryIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: snow.primarySoft
  },
  cardEntryTitle: {
    color: snow.ink,
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: "800"
  },
  cardEntrySubtitle: {
    color: snow.primaryDeep,
    fontSize: 12,
    fontFamily: fonts.medium,
    fontWeight: "700"
  },
  cardEntryMeta: {
    color: snow.sub,
    fontSize: 12.5,
    fontFamily: fonts.body,
    lineHeight: 18,
    marginTop: 4
  },
  cardEntryActions: {
    gap: 8,
    marginTop: 12
  },
  actionButtonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14
  },
  actionButton: {
    alignItems: "center",
    borderRadius: radius.base,
    borderWidth: 1.5,
    flex: 1,
    flexBasis: "45%",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10
  },
  actionButtonNeutral: {
    borderColor: snow.line,
    backgroundColor: snow.card
  },
  actionButtonCoral: {
    borderColor: "#E8A0A0",
    backgroundColor: "#FFF0EF"
  },
  actionButtonAmber: {
    borderColor: "#E8C880",
    backgroundColor: "#FFF8EC"
  },
  actionButtonLabel: {
    color: snow.ink,
    fontSize: 12,
    fontFamily: fonts.bold,
    fontWeight: "800",
    textAlign: "center"
  },
  actionButtonLabelCoral: {
    color: "#B83030"
  },
  actionButtonLabelAmber: {
    color: "#A05010"
  },
  miniStat: {
    flex: 1,
    flexBasis: 90,
    alignItems: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  miniStatCoral: {
    borderColor: "#E8A0A0",
    backgroundColor: "#FFF0EF"
  },
  miniStatAmber: {
    borderColor: "#E8C880",
    backgroundColor: "#FFF8EC"
  },
  miniStatBlue: {
    borderColor: "#90C0E8",
    backgroundColor: "#EEF4FF"
  },
  miniStatValue: {
    fontSize: 16,
    fontFamily: fonts.numeral,
    fontWeight: "800"
  },
  miniStatLabel: {
    color: snow.sub,
    fontSize: 10.5,
    fontFamily: fonts.body,
    textAlign: "center"
  },
  cardCreateRow: {
    flexDirection: "row",
    gap: 10
  },
  collapseToggle: {
    alignItems: "center",
    paddingVertical: 10
  },
  collapseToggleText: {
    color: snow.faint,
    fontSize: 12,
    fontFamily: fonts.body
  }
});

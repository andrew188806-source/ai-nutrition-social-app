import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, LockNotice, PremiumBadge, SectionTitle, TagRow, UpgradePromptModal, colors } from "../components/DemoUi";
import { AiNoteBox, Badge, Card as SnowCard, EmptyState, FeastCoverCard, FillBar, PrimaryButton as SnowPrimaryButton, SectionHeader as SnowSectionHeader, SecondaryButton as SnowSecondaryButton, Segmented, SeatLine, getMascotSource } from "../theme/components";
import { GroupCalorieSharingCard, GroupTableCalorieUpload, getLatestGroupCalorieShare, type GroupCalorieShare } from "../features/calorie-sharing";
import { getCommunityCardSettings, getSelectedMascot } from "../features/community-card-settings";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { createRestaurantFourPersonTable, getActiveFourPersonTable, updateActiveFourPersonTable, type ActiveFourPersonTable } from "../features/group-tables";
import { getCommunityProfileByProfileId, resolveCommunityProfileDisplay, type AvatarSource } from "../features/display-resolvers";
import { createOrOpenGroupTableChat, getMockTableParticipantCandidates } from "../features/meal-buddy-card";

export default function GroupTablesScreen() {
  const router = useRouter();

  // Four-person tables intentionally live inside the Meal Buddy page top sections.
  // Keep this route only as a compatibility redirect for old links.
  useEffect(() => {
    router.replace("/meal-buddies?section=tables");
  }, [router]);

  return null;
}

type GroupTableChatTarget = {
  chatThreadId: string;
  hostProfileId?: string;
  participantProfileIds?: string[];
  tableId: string;
  tableName: string;
};

type RestaurantTableContext = {
  action: "find" | "create";
  restaurantId: string;
  restaurantLocation: string;
  restaurantName: string;
  restaurantTags: string[];
  suggestedTime: string;
};

type GroupDiningTab = "my" | "find" | "create";

const hostedTableChatTarget: GroupTableChatTarget = {
  chatThreadId: "chat-group-table-japanese-dinner",
  hostProfileId: "mina",
  participantProfileIds: ["mina", "bo", "an"],
  tableId: "table-japanese-dinner",
  tableName: "四人桌｜清爽日式晚餐"
};

export function GroupTablesContent({
  onOpenChat,
  restaurantContext
}: {
  onOpenChat?: (target: GroupTableChatTarget) => void;
  restaurantContext?: RestaurantTableContext;
}) {
  const [demoMode] = useDemoUserPlan();
  const [joinedTable, setJoinedTable] = useState<string | null>(null);
  const [showCreateUpgrade, setShowCreateUpgrade] = useState(false);
  const [showInviteUpgrade, setShowInviteUpgrade] = useState(false);
  const [showCapacityWarning, setShowCapacityWarning] = useState(false);
  const [showCapacityOptions, setShowCapacityOptions] = useState(false);
  const [tableCapacity, setTableCapacity] = useState<4 | 6 | 8>(4);
  const [tableParticipantCount, setTableParticipantCount] = useState<3 | 4>(3);
  const [activeTable, setActiveTable] = useState<ActiveFourPersonTable | null>(() => getActiveFourPersonTable());
  const [showReplaceTableConfirm, setShowReplaceTableConfirm] = useState(false);
  const [showFriendSearch, setShowFriendSearch] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<string[]>([]);
  const [activeSort, setActiveSort] = useState<string>(zhTW.mobile.correctedFlow.inviteSortOptions[0]);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [inviteSent, setInviteSent] = useState(false);
  const [moduleView, setModuleView] = useState<"tables" | "invite">("tables");
  const [tableTab, setTableTab] = useState<"my" | "find">("my");
  const [myTableView, setMyTableView] = useState<"card" | "participants">("card");
  const [restaurantSearchDismissed, setRestaurantSearchDismissed] = useState(false);
  const [isGroupCalorieUploadOpen, setIsGroupCalorieUploadOpen] = useState(false);
  const [groupCalorieShare, setGroupCalorieShare] = useState<GroupCalorieShare | null>(null);
  const isPremiumMode = demoMode === "premium";
  const activeGroupTab: GroupDiningTab = moduleView === "invite" ? "create" : tableTab;
  const tableSearchContext = restaurantContext?.action === "find" && !restaurantSearchDismissed ? restaurantContext : undefined;
  const communitySettings = getCommunityCardSettings();
  const hostMascot = getSelectedMascot(communitySettings);
  const fullInviteCandidates = useMemo(() => getFullInviteCandidates(isPremiumMode), [isPremiumMode]);
  const sortedInviteCandidates = useMemo(() => sortInviteCandidates(fullInviteCandidates, activeSort, sortDirection), [activeSort, fullInviteCandidates, sortDirection]);
  const inviteCandidates = sortedInviteCandidates.slice(0, isPremiumMode ? 10 : 5);
  const activeTableChatTarget = activeTable
    ? {
        chatThreadId: activeTable.groupChatThreadId ?? `chat-group-${activeTable.tableId}`,
        hostProfileId: activeTable.hostProfileId,
        participantProfileIds: activeTable.participantProfileIds,
        tableId: activeTable.tableId,
        tableName: `四人桌｜${activeTable.restaurantName}`
      }
    : hostedTableChatTarget;
  const participants = useMemo(
    () => getTableParticipants(activeTableChatTarget.tableId, activeTableChatTarget.participantProfileIds),
    [activeTableChatTarget.tableId, activeTableChatTarget.participantProfileIds?.join("|")]
  );
  useEffect(() => {
    setGroupCalorieShare(getLatestGroupCalorieShare(activeTableChatTarget.tableId));
  }, [activeTableChatTarget.tableId]);
  const restaurantTableResults = useMemo(
    () => tableSearchContext ? rankExistingTablesForRestaurant(tableSearchContext) : { exact: [], similar: [], visible: zhTW.mobile.groupTables.tables },
    [tableSearchContext]
  );
  const restaurantTables = restaurantTableResults.visible;

  useEffect(() => {
    if (restaurantContext?.action !== "create") {
      return;
    }
    const existingTable = getActiveFourPersonTable();
    if (existingTable && existingTable.restaurantId !== restaurantContext.restaurantId) {
      setShowReplaceTableConfirm(true);
      return;
    }
    const nextTable = existingTable ?? createTableFromRestaurantContext(restaurantContext);
    setActiveTable(nextTable);
    setTableCapacity(nextTable.maxParticipants);
    setTableParticipantCount(nextTable.participantProfileIds.length >= 4 ? 4 : 3);
    setTableTab("my");
    setMyTableView("card");
    focusGroupTableElementAfterRender("my-table-state-area");
  }, [restaurantContext]);

  useEffect(() => {
    setRestaurantSearchDismissed(false);
  }, [restaurantContext?.action, restaurantContext?.restaurantId]);

  useEffect(() => {
    if (tableSearchContext) {
      setTableTab("find");
      focusGroupTableElementAfterRender("available-table-state-area");
    }
  }, [tableSearchContext]);

  useEffect(() => {
    if (moduleView === "invite") {
      focusGroupTableElementAfterRender("group-table-invite-mode");
    }
  }, [moduleView]);

  useEffect(() => {
    if (!activeTable) {
      return;
    }
    setTableCapacity(activeTable.maxParticipants);
    setTableParticipantCount(activeTable.participantProfileIds.length >= 4 ? 4 : 3);
  }, [activeTable?.tableId]);

  useEffect(() => {
    if (myTableView === "participants") {
      focusGroupTableElementAfterRender("my-table-state-area");
    }
  }, [myTableView]);

  useEffect(() => {
    if (tableParticipantCount >= 4) {
      createOrOpenGroupTableChat(activeTableChatTarget.tableName, activeTableChatTarget.tableId, activeTableChatTarget.chatThreadId);
    }
  }, [tableParticipantCount, activeTableChatTarget.chatThreadId, activeTableChatTarget.tableId, activeTableChatTarget.tableName]);

  return (
    <>
      <UpgradePromptModal visible={showCreateUpgrade} title={zhTW.mobile.correctedFlow.myTableTitle} body={zhTW.mobile.correctedFlow.activeTableLimitReached} actionLabel={zhTW.common.close} onClose={() => setShowCreateUpgrade(false)} />
      <UpgradePromptModal visible={showInviteUpgrade} title={zhTW.mobile.refinedLogic.mealPartner.premiumModalTitle} body={zhTW.mobile.correctedFlow.freeInviteAllUpgrade} actionLabel={zhTW.common.close} onClose={() => setShowInviteUpgrade(false)} />
      <UpgradePromptModal visible={showCapacityWarning} title={zhTW.mobile.correctedFlow.upgradeCapacity} body={zhTW.mobile.correctedFlow.capacityNotReady} actionLabel={zhTW.common.close} onClose={() => setShowCapacityWarning(false)} />
      <GroupTableCalorieUpload
        visible={isGroupCalorieUploadOpen}
        onClose={() => setIsGroupCalorieUploadOpen(false)}
        groupTableId={activeTableChatTarget.tableId}
        hostUserId="demo-user"
        defaultPeopleCount={tableParticipantCount}
        onGenerated={(share) => {
          setGroupCalorieShare(share);
          setIsGroupCalorieUploadOpen(false);
        }}
      />
      <ReplaceActiveTableModal
        visible={showReplaceTableConfirm}
        onCancel={() => setShowReplaceTableConfirm(false)}
        onReplace={() => {
          if (!restaurantContext) {
            return;
          }
          const nextTable = createTableFromRestaurantContext(restaurantContext);
          setActiveTable(nextTable);
          setTableCapacity(4);
          setTableParticipantCount(3);
          setShowReplaceTableConfirm(false);
          setTableTab("my");
          setMyTableView("card");
          focusGroupTableElementAfterRender("my-table-state-area");
        }}
      />
      <CapacityUpgradeModal
        capacity={tableCapacity}
        participantCount={tableParticipantCount}
        visible={showCapacityOptions}
        onClose={() => setShowCapacityOptions(false)}
        onSelect={(capacity) => {
          setTableCapacity(capacity);
          const updated = updateActiveFourPersonTable({ maxParticipants: capacity });
          if (updated) {
            setActiveTable(updated);
          }
          setShowCapacityOptions(false);
        }}
      />
      <FriendSearchModal
        candidates={fullInviteCandidates}
        visible={showFriendSearch}
        onClose={() => setShowFriendSearch(false)}
        onSelect={(id) => {
          setSelectedInviteIds((current) => (isPremiumMode ? addUnique(current, id) : [id]));
          setShowFriendSearch(false);
          focusGroupTableElementAfterRender("group-table-invite-mode");
        }}
      />

      <SnowCard>
        <SnowSectionHeader title="多人飯局" subtitle="與飯友一起開桌，分享美食時光。" />
        {isPremiumMode ? (
          <View style={styles.hostRow}>
            {getMascotSource(hostMascot.id) ? (
              <Image source={getMascotSource(hostMascot.id)!} style={styles.hostAvatar} resizeMode="cover" />
            ) : (
              <View style={styles.hostAvatar} />
            )}
            <View style={styles.flex}>
              <Text style={styles.aaRule}>{zhTW.mobile.refinedLogic.avatar.tableHostRule}</Text>
            </View>
          </View>
        ) : null}
        <Segmented
          options={[
            { id: "my", label: "我的飯局" },
            { id: "find", label: "尋找飯局" },
            { id: "create", label: "建立飯局" }
          ]}
          activeId={activeGroupTab}
          onChange={(id) => {
            if (id === "create") {
              setModuleView("invite");
            } else {
              setModuleView("tables");
              setTableTab(id as "my" | "find");
            }
          }}
        />
      </SnowCard>

      {activeGroupTab === "create" ? (
        <View nativeID="group-table-invite-mode">
          <InviteMode
            activeSort={activeSort}
            candidates={inviteCandidates}
            inviteSent={inviteSent}
            isPremiumMode={isPremiumMode}
            selectedIds={selectedInviteIds}
            onBack={() => {
              setModuleView("tables");
              setTableTab("my");
            }}
            sortDirection={sortDirection}
            onChangeSort={(sort) => {
              if (sort === activeSort) {
                setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
                return;
              }
              setActiveSort(sort);
              setSortDirection("desc");
            }}
            onComplete={() => {
              if (selectedInviteIds.length === 0) {
                return;
              }
              setInviteSent(true);
              setTableParticipantCount(4);
              const participantProfileIds = ["demo-user", ...selectedInviteIds].slice(0, 4);
              const updated = updateActiveFourPersonTable({
                hostProfileId: "demo-user",
                participantProfileIds,
                participantIds: participantProfileIds,
                status: "已成團",
                groupChatThreadId: hostedTableChatTarget.chatThreadId
              });
              if (updated) {
                setActiveTable(updated);
              }
              setModuleView("tables");
              setTableTab("my");
            }}
            onInviteAll={() => {
              if (!isPremiumMode) {
                setShowInviteUpgrade(true);
                return;
              }
              setSelectedInviteIds(inviteCandidates.map((candidate) => candidate.id));
            }}
            onSearch={() => setShowFriendSearch(true)}
            onShowUpgrade={() => setShowInviteUpgrade(true)}
            onToggleCandidate={(id) => {
              setInviteSent(false);
              setSelectedInviteIds((current) => {
                if (!isPremiumMode) {
                  return current.includes(id) ? [] : [id];
                }
                return current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id];
              });
            }}
          />
        </View>
      ) : null}

      {activeGroupTab === "my" ? (
        <View nativeID="my-table-state-area">
          {isPremiumMode ? (
            <>
              {myTableView === "card" ? (
                <MyTableOverview
                  activeTable={activeTable}
                  groupCalorieShare={groupCalorieShare}
                  onCreate={() => {
                    if (activeTable) {
                      setShowCreateUpgrade(true);
                      return;
                    }
                    const nextTable = createRestaurantFourPersonTable({
                      restaurantId: "manual-table",
                      restaurantName: zhTW.mobile.correctedFlow.hostedTable.name,
                      location: zhTW.mobile.correctedFlow.hostedTable.place,
                      cuisineTags: [],
                      suggestedTime: zhTW.mobile.correctedFlow.hostedTable.time
                    });
                    setActiveTable(nextTable);
                  }}
                  onInvite={() => setModuleView("invite")}
                  onManage={() => setMyTableView("participants")}
                  onOpen={() => setMyTableView("participants")}
                  onOpenChat={() => onOpenChat?.(activeTableChatTarget)}
                  onUpgradeCapacity={() => {
                    if (tableParticipantCount < 4) {
                      setShowCapacityWarning(true);
                      return;
                    }
                    setShowCapacityOptions(true);
                  }}
                  tableCapacity={tableCapacity}
                  tableParticipantCount={tableParticipantCount}
                  onRecordCalories={() => setIsGroupCalorieUploadOpen(true)}
                />
              ) : null}
              {myTableView === "participants" ? (
                <ParticipantsMode
                  activeTable={activeTable}
                  groupCalorieShare={groupCalorieShare}
                  participants={participants}
                  onBack={() => setMyTableView("card")}
                  onOpenChat={() => onOpenChat?.(activeTableChatTarget)}
                  onOpenParticipant={(profileId) => {
                    if (profileId && getCommunityProfileByProfileId(profileId)) {
                      router.push({ pathname: "/community-profile/[profileId]", params: { profileId } });
                    }
                  }}
                />
              ) : null}
            </>
          ) : (
            <EmptyState
              mascot="balance"
              title="升級以使用多人飯局"
              body="付費版可以建立、加入、管理飯局，並與飯友即時聊天。"
              primaryAction={{ label: "了解付費版", icon: "star", onPress: () => setShowCreateUpgrade(true) }}
            />
          )}
        </View>
      ) : null}

      {activeGroupTab === "find" ? (
        <View nativeID="available-table-state-area">
          {tableSearchContext ? (
            <RestaurantTableSearchContextCardWithBack
              context={tableSearchContext}
              exactCount={restaurantTableResults.exact.length}
              similarCount={restaurantTableResults.similar.length}
              onClear={() => setRestaurantSearchDismissed(true)}
            />
          ) : null}
          {restaurantTables.length === 0 ? (
            <EmptyState
              mascot="explorer"
              title="附近還沒有飯局"
              body="目前沒有符合的四人桌，試試建立一個新的飯局邀請飯友加入。"
              primaryAction={{ label: "建立飯局", icon: "plus", onPress: () => setModuleView("invite") }}
            />
          ) : null}
          {restaurantTables.map((table) => {
            const isJoined = joinedTable === table.mealTheme;
            const isCompleted = table.status === zhTW.mobile.groupTables.completedStatusLabel;
            const isLockedForFree = !isPremiumMode && table.premiumOnly;
            const shouldBlurParticipants = !isPremiumMode && !isCompleted;
            const coverVariant = table.premiumOnly ? "warm" : "fresh";
            const joinedCount = shouldBlurParticipants ? 1 : 2;

            return (
              <SnowCard key={table.mealTheme}>
                <FeastCoverCard
                  variant={coverVariant}
                  timeLabel={"今晚"}
                  badgeLabel={table.status === zhTW.mobile.groupTables.completedStatusLabel ? zhTW.mobile.groupTables.completedState : table.premiumOnly || isPremiumMode ? zhTW.mobile.premiumUi.premiumTables : zhTW.mobile.premiumUi.freeBadge}
                  badgeUrgent={!isCompleted && !table.premiumOnly}
                  title={table.mealTheme}
                  subtitle={table.restaurantName}
                />
                <View style={{ marginTop: 12 }}>
                  <SeatLine
                    joined={Array.from({ length: joinedCount }, (_, i) => ({ type: "real" as const, initial: ["宜", "綠"][i] }))}
                    openCount={4 - joinedCount}
                    size={34}
                  />
                  <View style={{ marginTop: 8 }}>
                    <FillBar joined={joinedCount} size={4} height={5} />
                  </View>
                </View>
                <TagRow tags={table.tags} />
                {table.reason ? <AiNoteBox label="AI 推薦" text={table.reason} /> : null}
                <Text style={styles.aaRule}>{zhTW.mobile.correctedFlow.aaTableRule}</Text>
                <View style={styles.participants}>
                  {[0, 1, 2, 3].map((item) => {
                    const isHiddenParticipant = shouldBlurParticipants && item > 1;
                    return (
                      <View key={item} style={[styles.participant, isHiddenParticipant && styles.lockedParticipant]}>
                        <Text style={[styles.participantText, isHiddenParticipant && styles.blurredParticipantText]}>{isHiddenParticipant ? "..." : "OK"}</Text>
                        {isHiddenParticipant ? <View style={styles.participantBlur} /> : null}
                      </View>
                    );
                  })}
                </View>
                {isLockedForFree ? <LockNotice title={zhTW.mobile.premiumUi.upgradeCompatibilityTitle} body={zhTW.mobile.groupTables.lockedCompatibility} /> : null}
                {!isCompleted && !isPremiumMode ? <Text style={styles.premiumLock}>{zhTW.mobile.groupTables.premiumVisibility}</Text> : null}
                <Pressable disabled={isCompleted} style={[styles.joinButton, isCompleted && styles.disabledButton]} onPress={() => setJoinedTable(table.mealTheme)}>
                  <Text style={styles.joinButtonText}>{isCompleted ? zhTW.mobile.groupTables.completedState : isJoined ? zhTW.mobile.groupTables.joinedState : zhTW.common.join}</Text>
                </Pressable>
                <Pressable style={styles.inviteButton} onPress={() => setModuleView("invite")}>
                  <Text style={styles.joinButtonText}>{zhTW.mobile.correctedFlow.oneTapInvite}</Text>
                </Pressable>
              </SnowCard>
            );
          })}
        </View>
      ) : null}
    </>
  );
}

type InviteCandidate = {
  id: string;
  profileId: string;
  name: string;
  goal: string;
  lastTable: string;
  mealCount: number;
  knownDays: number;
  recentDays: number;
  tags: readonly string[];
};

function focusGroupTableElementAfterRender(elementId: string) {
  const focus = () => {
    const browserWindow = (globalThis as typeof globalThis & { window?: { document?: { getElementById?: (id: string) => { scrollIntoView?: (options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition }) => void } | null } } }).window;
    const element = browserWindow?.document?.getElementById?.(elementId);
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };
  [80, 220, 520].forEach((delay) => setTimeout(focus, delay));
}

type TableParticipant = InviteCandidate & {
  status: string;
  summary: string;
};

function getTableParticipants(tableId: string, participantProfileIds?: readonly string[]): TableParticipant[] {
  const tableCandidates = getMockTableParticipantCandidates(tableId);
  const candidates = participantProfileIds?.length
    ? participantProfileIds.map((profileId, index) => {
        const tableCandidate = tableCandidates.find((candidate) => candidate.userId === profileId);
        const profile = resolveCommunityProfileDisplay(profileId);
        return {
          id: profileId,
          profileId,
          name: profile.displayName,
          goal: tableCandidate?.nutritionGoal ?? profile.shortProfileSummary,
          lastTable: tableCandidate?.preferredFoodName ?? "",
          mealCount: 12 - index,
          knownDays: 20 + index * 9,
          recentDays: (index % 6) + 1,
          tags: profile.tags
        };
      })
    : tableCandidates.map((candidate, index) => {
        const profile = resolveCommunityProfileDisplay(candidate.userId);
        return {
          id: candidate.userId,
          profileId: candidate.userId,
          name: profile.displayName,
          goal: candidate.nutritionGoal,
          lastTable: candidate.preferredFoodName,
          mealCount: 12 - index,
          knownDays: 20 + index * 9,
          recentDays: (index % 6) + 1,
          tags: profile.tags
        };
      });

  return candidates.slice(0, 4).map((candidate, index) => ({
    ...candidate,
    status: zhTW.mobile.correctedFlow.participantStatuses[index % zhTW.mobile.correctedFlow.participantStatuses.length],
    summary: zhTW.mobile.correctedFlow.participantSummary[index % zhTW.mobile.correctedFlow.participantSummary.length]
  }));
}

function addUnique(items: string[], id: string) {
  return items.includes(id) ? items : [...items, id];
}

function getFullInviteCandidates(isPremiumMode: boolean): InviteCandidate[] {
  const candidates = getCanonicalGroupInviteCandidates();
  return candidates.slice(0, isPremiumMode ? candidates.length : 5).map((candidate, index) => {
    const profile = resolveCommunityProfileDisplay(candidate.userId);
    return {
      id: candidate.userId,
      profileId: candidate.userId,
      name: profile.displayName,
      goal: candidate.nutritionGoal,
      lastTable: candidate.preferredFoodName,
      mealCount: 12 - index,
      knownDays: 20 + index * 9,
      recentDays: (index % 6) + 1,
      tags: profile.tags
    };
  });
}

function getCanonicalGroupInviteCandidates() {
  const candidates = [
    ...getMockTableParticipantCandidates("table-japanese-dinner"),
    ...getMockTableParticipantCandidates("table-light-lunch"),
    ...getMockTableParticipantCandidates("table-chicken-bento")
  ];
  return [...new Map(candidates.map((candidate) => [candidate.userId, candidate])).values()];
}

function sortInviteCandidates(candidates: InviteCandidate[], activeSort: string, direction: "desc" | "asc"): InviteCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    const multiplier = direction === "desc" ? 1 : -1;
    if (activeSort === zhTW.mobile.correctedFlow.inviteSortOptions[1]) {
      return (b.knownDays - a.knownDays) * multiplier;
    }
    if (activeSort === zhTW.mobile.correctedFlow.inviteSortOptions[2]) {
      return (a.recentDays - b.recentDays) * multiplier;
    }
    return (b.mealCount - a.mealCount) * multiplier;
  });

  return sorted;
}

function rankExistingTablesForRestaurant(context: RestaurantTableContext) {
  const exact = zhTW.mobile.groupTables.tables.filter((table) => table.restaurantName === context.restaurantName);
  const similar = exact.length > 0
    ? []
    : zhTW.mobile.groupTables.tables.filter((table) => table.tags.some((tag) => context.restaurantTags.some((restaurantTag) => tag.includes(restaurantTag) || restaurantTag.includes(tag))));
  return {
    exact,
    similar,
    visible: exact.length > 0 ? exact : similar
  };
}

function createTableFromRestaurantContext(context: RestaurantTableContext) {
  return createRestaurantFourPersonTable({
    restaurantId: context.restaurantId,
    restaurantName: context.restaurantName,
    location: context.restaurantLocation,
    cuisineTags: context.restaurantTags,
    suggestedTime: context.suggestedTime
  });
}

function ReplaceActiveTableModal({ onCancel, onReplace, visible }: { onCancel: () => void; onReplace: () => void; visible: boolean }) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <SectionTitle title="你已經有一個進行中的四人桌" subtitle="付費版同一時間只能發起 1 個四人桌。要用這間餐廳取代原本的餐桌嗎？" />
          <Pressable style={styles.joinButton} onPress={onReplace}>
            <Text style={styles.joinButtonText}>取代舊餐桌</Text>
          </Pressable>
          <Pressable style={styles.secondaryInviteButton} onPress={onCancel}>
            <Text style={styles.secondaryInviteButtonText}>取消建立</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RestaurantTableSearchContextCardWithBack({
  context,
  exactCount,
  onClear,
  similarCount
}: {
  context: RestaurantTableContext;
  exactCount: number;
  onClear: () => void;
  similarCount: number;
}) {
  const subtitle =
    exactCount > 0
      ? `優先顯示同餐廳四人桌，共 ${exactCount} 桌。`
      : similarCount > 0
        ? `這間餐廳暫無可加入桌，先顯示 ${similarCount} 桌相似料理。`
        : "目前這間餐廳還沒有可加入的四人桌，可以建立一桌。";

  return (
    <Card tone="mint">
      <PremiumBadge label="餐廳搜尋" variant="free" />
      <SectionTitle title={`正在尋找：${context.restaurantName}`} subtitle={subtitle} />
      <TagRow tags={context.restaurantTags.slice(0, 3)} />
      <Pressable style={styles.secondaryInviteButton} onPress={onClear}>
        <Text style={styles.secondaryInviteButtonText}>返回四人餐桌</Text>
      </Pressable>
    </Card>
  );
}

function MyTableOverview({ activeTable, groupCalorieShare, onCreate, onInvite, onManage, onOpen, onOpenChat, onRecordCalories, onUpgradeCapacity, tableCapacity, tableParticipantCount }: { activeTable: ActiveFourPersonTable | null; groupCalorieShare: GroupCalorieShare | null; onCreate: () => void; onInvite: () => void; onManage: () => void; onOpen: () => void; onOpenChat: () => void; onRecordCalories: () => void; onUpgradeCapacity: () => void; tableCapacity: 4 | 6 | 8; tableParticipantCount: 3 | 4 }) {
  return (
    <Card tone="premium">
      <SnowSectionHeader title={zhTW.mobile.correctedFlow.myTableTitle} subtitle={zhTW.mobile.correctedFlow.activeTableLimitHint} />
      {!activeTable ? (
        <EmptyState
          mascot="protein"
          title="還沒有建立飯局"
          body={zhTW.mobile.correctedFlow.noActiveTable}
          primaryAction={{ label: zhTW.mobile.correctedFlow.startTable, icon: "plus", onPress: onCreate }}
        />
      ) : (
        <>
          <HostedTableCard activeTable={activeTable} onInvite={onInvite} onManage={onManage} onOpen={onOpen} onOpenChat={onOpenChat} onRecordCalories={onRecordCalories} onUpgradeCapacity={onUpgradeCapacity} tableCapacity={tableCapacity} tableParticipantCount={tableParticipantCount} />
          {groupCalorieShare ? (
            <View style={styles.groupCalorieCardWrap}>
              <GroupCalorieSharingCard share={groupCalorieShare} currentUserId="demo-user" restaurantName={activeTable.restaurantName} />
            </View>
          ) : null}
        </>
      )}
    </Card>
  );
}

function HostedTableCard({ activeTable, onInvite, onManage, onOpen, onOpenChat, onRecordCalories, onUpgradeCapacity, tableCapacity, tableParticipantCount }: { activeTable: ActiveFourPersonTable; onInvite: () => void; onManage: () => void; onOpen?: () => void; onOpenChat?: () => void; onRecordCalories?: () => void; onUpgradeCapacity: () => void; tableCapacity: 4 | 6 | 8; tableParticipantCount: 3 | 4 }) {
  const urgentLabel = tableParticipantCount < tableCapacity ? `還缺 ${tableCapacity - tableParticipantCount} 位` : "已滿座";
  return (
    <View style={styles.hostedTableCard}>
      <FeastCoverCard
        variant="warm"
        timeLabel={activeTable.suggestedTime || "待定"}
        badgeLabel={urgentLabel}
        badgeUrgent={tableParticipantCount < tableCapacity}
        title={`${activeTable.restaurantName}｜四人餐桌`}
        subtitle={activeTable.location || "地點待確認"}
      />
      <View style={{ marginTop: 10, gap: 6 }}>
        <SeatLine
          joined={Array.from({ length: tableParticipantCount }, (_, i) => ({ type: "real" as const, initial: ["宜", "綠", "R", "哲"][i] }))}
          openCount={tableCapacity - tableParticipantCount}
          size={34}
        />
        <FillBar joined={tableParticipantCount} size={tableCapacity} height={5} />
      </View>
      <Pressable style={styles.hostedTableInfo} onPress={onOpen ?? onManage}>
        <Text style={styles.hostedTableMeta}>{zhTW.mobile.correctedFlow.tablePlaceLabel}: {activeTable.location || "待確認"}</Text>
        <Text style={styles.hostedTableMeta}>{zhTW.mobile.correctedFlow.tableStatusLabel}: {activeTable.status}</Text>
      </Pressable>
      <View style={styles.tableActionGroup}>
        <Pressable style={styles.tablePrimaryAction} onPress={onManage}>
          <Text style={styles.tablePrimaryActionText}>{zhTW.mobile.correctedFlow.manageTable}</Text>
        </Pressable>
        <Pressable style={styles.tableSecondaryAction} onPress={onInvite}>
          <Text style={styles.tableSecondaryActionText}>{zhTW.mobile.correctedFlow.oneTapInvite}</Text>
        </Pressable>
        <Pressable style={styles.tableTertiaryAction} onPress={onUpgradeCapacity}>
          <Text style={styles.tableTertiaryActionText}>{zhTW.mobile.correctedFlow.upgradeCapacity}</Text>
        </Pressable>
        {tableParticipantCount >= 4 && onOpenChat ? (
          <Pressable style={styles.tableTertiaryAction} onPress={onOpenChat}>
            <Text style={styles.tableTertiaryActionText}>飯局聊天室</Text>
          </Pressable>
        ) : null}
        {onRecordCalories ? (
          <Pressable style={styles.tableTertiaryAction} onPress={onRecordCalories}>
            <Text style={styles.tableTertiaryActionText}>{zhTW.mobile.calorieSharing.groupUploadCta}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ParticipantsMode({ activeTable, groupCalorieShare, onBack, onOpenChat, onOpenParticipant, participants }: { activeTable: ActiveFourPersonTable | null; groupCalorieShare: GroupCalorieShare | null; onBack: () => void; onOpenChat: () => void; onOpenParticipant: (profileId?: string) => void; participants: TableParticipant[] }) {
  const table = activeTable ?? {
    restaurantName: zhTW.mobile.correctedFlow.hostedTable.name,
    location: zhTW.mobile.correctedFlow.hostedTable.place,
    suggestedTime: zhTW.mobile.correctedFlow.hostedTable.time,
    maxParticipants: 4,
    participantProfileIds: [],
    status: zhTW.mobile.correctedFlow.hostedTable.status
  };
  const participantCount = table.participantProfileIds.length || participants.length;
  return (
    <SnowCard tone="ai">
      <SnowSectionHeader title={zhTW.mobile.correctedFlow.participantsTitle} subtitle={zhTW.mobile.correctedFlow.activeTableLimitHint} />
      <View style={{ gap: 6 }}>
        <SeatLine
          joined={participants.slice(0, participantCount).map((p) => ({ type: "real" as const, initial: p.name.slice(0, 1) }))}
          openCount={table.maxParticipants - participantCount}
          size={34}
        />
        <FillBar joined={participantCount} size={table.maxParticipants} height={5} />
      </View>
      <View style={{ gap: 4 }}>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tablePlaceLabel}: {table.location}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tableTimeLabel}: {table.suggestedTime}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tableStatusLabel}: {table.status}</Text>
      </View>
      {groupCalorieShare ? (
        <View style={styles.groupCalorieCardWrap}>
          <GroupCalorieSharingCard share={groupCalorieShare} currentUserId="demo-user" restaurantName={table.restaurantName} />
        </View>
      ) : null}
      {participants.map((participant) => (
        <Pressable key={participant.id} style={styles.participantCard} onPress={() => onOpenParticipant(participant.profileId)}>
          <View style={styles.participantMiniAvatar}>
            <ResolvedParticipantAvatar avatarSource={resolveCommunityProfileDisplay(participant.profileId).avatarSource} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.candidateName}>{resolveCommunityProfileDisplay(participant.profileId).displayName}</Text>
            <Text style={styles.aaRule}>{participant.status}</Text>
            <Text style={styles.reason}>{participant.summary}</Text>
            <TagRow tags={participant.tags.slice(0, 3)} />
          </View>
        </Pressable>
      ))}
      <Pressable style={styles.joinButton} onPress={onOpenChat}>
        <Text style={styles.joinButtonText}>飯局聊天室</Text>
      </Pressable>
      <Pressable style={styles.bottomReturnButton} onPress={onBack}>
        <Text style={styles.bottomReturnButtonText}>{zhTW.mobile.correctedFlow.backToMyTable}</Text>
      </Pressable>
    </SnowCard>
  );
}

function ParticipantCommunityCard({ onBack, participant }: { onBack: () => void; participant: TableParticipant }) {
  const profile = resolveCommunityProfileDisplay(participant.profileId);
  return (
    <Card tone="premium">
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Text style={styles.headerButtonText}>{zhTW.mobile.correctedFlow.backToParticipants}</Text>
      </Pressable>
      <SectionTitle title={zhTW.mobile.correctedFlow.communityCardTitle} subtitle={participant.summary} />
      <View style={styles.communityCardTop}>
        <View style={styles.communityAvatar}>
          <ResolvedParticipantAvatar avatarSource={profile.avatarSource} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.restaurant}>{profile.displayName}</Text>
          <Text style={styles.aaRule}>{zhTW.mobile.correctedFlow.verifiedParticipant}</Text>
        </View>
      </View>
      <TagRow tags={profile.tags} />
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.commonMealInterests}: {participant.goal}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.commonArea}: {participant.lastTable}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.mealFriendCount}: {participant.mealCount}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.recentMealIntent}: {participant.lastTable}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.socialIntro}: {participant.summary}</Text>
    </Card>
  );
}

function ResolvedParticipantAvatar({ avatarSource }: { avatarSource: AvatarSource }) {
  if (avatarSource.type === "mascot") {
    const source = getMascotSource(avatarSource.mascotId);
    return source ? <Image source={source} style={styles.resolvedAvatarImage} resizeMode="cover" /> : null;
  }
  if (avatarSource.type === "photo" && avatarSource.photoUrl) {
    return <Image source={{ uri: avatarSource.photoUrl }} style={styles.resolvedAvatarImage} resizeMode="cover" />;
  }
  if (avatarSource.type === "initial") {
    return <Text style={styles.participantText}>{avatarSource.value}</Text>;
  }
  return null;
}

function InviteMode({
  activeSort,
  candidates,
  inviteSent,
  isPremiumMode,
  onBack,
  onChangeSort,
  onComplete,
  onInviteAll,
  onSearch,
  onShowUpgrade,
  onToggleCandidate,
  selectedIds,
  sortDirection
}: {
  activeSort: string;
  candidates: InviteCandidate[];
  inviteSent: boolean;
  isPremiumMode: boolean;
  onBack: () => void;
  onChangeSort: (sort: string) => void;
  onComplete: () => void;
  onInviteAll: () => void;
  onSearch: () => void;
  onShowUpgrade: () => void;
  onToggleCandidate: (id: string) => void;
  selectedIds: string[];
  sortDirection: "desc" | "asc";
}) {
  const selectedCountLabel = `${zhTW.mobile.correctedFlow.selectedPrefix} ${selectedIds.length} ${zhTW.mobile.correctedFlow.selectedSuffix}`;

  return (
    <SnowCard>
      <View style={styles.inviteModeHeader}>
        <Pressable style={styles.headerButton} onPress={onBack}>
          <Text style={styles.headerButtonText}>{zhTW.mobile.correctedFlow.backToTables}</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable style={styles.headerButton} onPress={onSearch}>
            <Text style={styles.headerButtonText}>{zhTW.mobile.correctedFlow.searchFriend}</Text>
          </Pressable>
          <Pressable style={styles.headerButton} onPress={onInviteAll}>
            <Text style={styles.headerButtonText}>{zhTW.mobile.correctedFlow.inviteAll}</Text>
          </Pressable>
        </View>
      </View>

      <SnowSectionHeader title={inviteSent ? zhTW.mobile.correctedFlow.inviteSuccess : zhTW.mobile.correctedFlow.inviteModeTitle} subtitle={zhTW.mobile.correctedFlow.inviteModeBody} />

      <View style={styles.sortRow}>
        {zhTW.mobile.correctedFlow.inviteSortOptions.map((sort) => (
          <Pressable key={sort} style={[styles.sortButton, activeSort === sort && styles.sortButtonActive]} onPress={() => onChangeSort(sort)}>
            <Text style={[styles.sortButtonText, activeSort === sort && styles.sortButtonTextActive]}>{activeSort === sort ? `${sort} ${sortDirection === "desc" ? "↓" : "↑"}` : sort}</Text>
          </Pressable>
        ))}
      </View>

      {candidates.map((candidate) => (
        <Pressable key={candidate.id} style={[styles.candidateCard, selectedIds.includes(candidate.id) && styles.selectedCandidateCard]} onPress={() => onToggleCandidate(candidate.id)}>
          <View style={styles.candidateHeader}>
            <View style={styles.flex}>
              <Text style={styles.candidateName}>{candidate.name}</Text>
              <Text style={styles.reason}>{candidate.goal}</Text>
            </View>
            <Text style={styles.selectionPill}>{selectedIds.includes(candidate.id) ? zhTW.common.joined : zhTW.common.join}</Text>
          </View>
          <TagRow tags={candidate.tags.slice(0, 2)} />
          <Text style={styles.aaRule}>{candidate.lastTable}</Text>
        </Pressable>
      ))}

      {!isPremiumMode ? (
        <Pressable style={styles.secondaryInviteButton} onPress={onShowUpgrade}>
          <Text style={styles.secondaryInviteButtonText}>{zhTW.mobile.correctedFlow.viewMore}</Text>
        </Pressable>
      ) : null}

      <View style={styles.stickyInviteBar}>
        <Text style={styles.selectedCount}>{selectedIds.length > 0 ? selectedCountLabel : zhTW.mobile.correctedFlow.selectFriendFirst}</Text>
        <Pressable disabled={selectedIds.length === 0} style={[styles.completeButton, selectedIds.length === 0 && styles.disabledCompleteButton]} onPress={onComplete}>
          <Text style={styles.completeButtonText}>{zhTW.mobile.correctedFlow.completeInvite}</Text>
        </Pressable>
      </View>
    </SnowCard>
  );
}

function FriendSearchModal({ candidates, onClose, onSelect, visible }: { candidates: InviteCandidate[]; onClose: () => void; onSelect: (id: string) => void; visible: boolean }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery.length === 0 ? [] : candidates
    .map((candidate) => ({
      candidate,
      score: candidate.name.toLocaleLowerCase().includes(normalizedQuery) ? 0 : Math.abs(candidate.name.length - normalizedQuery.length)
    }))
    .sort((a, b) => a.score - b.score || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, 3)
    .map((result) => result.candidate);

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <SectionTitle title={zhTW.mobile.correctedFlow.searchFriendTitle} subtitle={zhTW.mobile.correctedFlow.searchFriendBody} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={zhTW.mobile.correctedFlow.searchFriendPlaceholder}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
          />
          {results.length === 0 ? <Text style={styles.searchHint}>{zhTW.mobile.correctedFlow.searchFriendEmptyHint}</Text> : null}
          {results.map((candidate) => (
            <Pressable key={candidate.id} style={styles.candidateCard} onPress={() => onSelect(candidate.id)}>
              <Text style={styles.candidateName}>{candidate.name}</Text>
              <Text style={styles.reason}>{candidate.goal}</Text>
              <TagRow tags={candidate.tags.slice(0, 2)} />
            </Pressable>
          ))}
          <Pressable style={styles.secondaryInviteButton} onPress={onClose}>
            <Text style={styles.secondaryInviteButtonText}>{zhTW.common.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CapacityUpgradeModal({ capacity, onClose, onSelect, participantCount, visible }: { capacity: 4 | 6 | 8; onClose: () => void; onSelect: (capacity: 6 | 8) => void; participantCount: 3 | 4; visible: boolean }) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <SectionTitle title={zhTW.mobile.correctedFlow.capacityModalTitle} subtitle={zhTW.mobile.correctedFlow.capacityModalBody} />
          <Text style={styles.aaRule}>{zhTW.mobile.correctedFlow.currentPeoplePrefix}{participantCount} {zhTW.mobile.correctedFlow.personUnit}</Text>
          <Pressable style={[styles.capacityOption, capacity === 6 && styles.selectedCandidateCard]} onPress={() => onSelect(6)}>
            <Text style={styles.candidateName}>{zhTW.mobile.correctedFlow.upgradeToSix}</Text>
          </Pressable>
          <Pressable style={[styles.capacityOption, capacity === 8 && styles.selectedCandidateCard]} onPress={() => onSelect(8)}>
            <Text style={styles.candidateName}>{zhTW.mobile.correctedFlow.upgradeToEight}</Text>
          </Pressable>
          <Pressable style={styles.secondaryInviteButton} onPress={onClose}>
            <Text style={styles.secondaryInviteButtonText}>{zhTW.common.close}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  createButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.ink,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  limitPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  createButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  tableHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    marginBottom: 12
  },
  flex: {
    flex: 1,
    gap: 5
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4
  },
  restaurant: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  theme: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800"
  },
  progress: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900",
    maxWidth: 120,
    textAlign: "right"
  },
  reason: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14
  },
  participants: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14
  },
  participant: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.teal,
    height: 34,
    width: 34
  },
  lockedParticipant: {
    overflow: "hidden",
    borderColor: "#EEDAC2",
    borderWidth: 1,
    backgroundColor: "#AEA498"
  },
  participantBlur: {
    position: "absolute",
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.34)"
  },
  participantText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  hostRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 12
  },
  hostAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.teal,
    height: 44,
    width: 44
  },
  hostedTableCard: {
    gap: 12,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    padding: 13
  },
  groupCalorieCardWrap: {
    marginTop: 12
  },
  hostedTableInfo: {
    gap: 4
  },
  hostedTableName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22
  },
  hostedTableMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  tableActionGroup: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  tablePrimaryAction: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.teal,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  tableSecondaryAction: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  tableTertiaryAction: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  tablePrimaryActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  tableSecondaryActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  tableTertiaryActionText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center"
  },
  capacityOption: {
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    padding: 14
  },
  participantCard: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    padding: 12
  },
  participantMiniAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.teal,
    height: 42,
    overflow: "hidden",
    width: 42
  },
  communityCardTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
    marginTop: 14
  },
  communityAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#ffffff",
    borderRadius: 34,
    borderWidth: 3,
    backgroundColor: colors.coral,
    height: 74,
    overflow: "hidden",
    width: 74
  },
  resolvedAvatarImage: {
    height: "100%",
    width: "100%"
  },
  blurredParticipantText: {
    letterSpacing: 1.5,
    opacity: 0.45
  },
  premiumLock: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 12
  },
  aaRule: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 19,
    marginTop: 12
  },
  inviteActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  smallButton: {
    borderRadius: 14,
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  smallButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  joinButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  joinButtonCompact: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  disabledButton: {
    backgroundColor: colors.ink
  },
  inviteButton: {
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: colors.coral,
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  candidateCard: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    padding: 12
  },
  selectedCandidateCard: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  inviteModeHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginBottom: 14
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  headerButton: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  headerButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  sortRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  sortButton: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  sortButtonActive: {
    borderColor: colors.teal,
    backgroundColor: colors.mint
  },
  sortButtonText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  sortButtonTextActive: {
    color: colors.ink
  },
  candidateHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  selectionPill: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#F9F2EA",
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  stickyInviteBar: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 14,
    padding: 12
  },
  selectedCount: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "900"
  },
  completeButton: {
    borderRadius: 999,
    backgroundColor: colors.coral,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  disabledCompleteButton: {
    backgroundColor: "#AEA498"
  },
  completeButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  secondaryInviteButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  secondaryInviteButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  bottomReturnButton: {
    alignItems: "center",
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  bottomReturnButtonText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(32,26,20,0.36)"
  },
  modalCard: {
    gap: 12,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.paper,
    padding: 20
  },
  searchInput: {
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "#ffffff",
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  searchHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19
  },
  candidateName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  joinButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  }
});

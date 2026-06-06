import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { Card, ComparisonPreview, LockNotice, PremiumBadge, SectionTitle, TagRow, UpgradePromptModal, colors } from "../components/DemoUi";
import { getAvatarDisplayLabel, getCommunityCardSettings, getSelectedMascot } from "../features/community-card-settings";
import { useDemoUserPlan } from "../features/demo-user-plan";
import { createRestaurantFourPersonTable, getActiveFourPersonTable, updateActiveFourPersonTable, type ActiveFourPersonTable } from "../features/group-tables";
import { createOrOpenGroupTableChat } from "../features/meal-buddy-card";

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

const hostedTableChatTarget: GroupTableChatTarget = {
  chatThreadId: "chat-group-table-japanese-dinner",
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
  const [demoMode, setDemoMode] = useDemoUserPlan();
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
  const [myTableView, setMyTableView] = useState<"card" | "participants" | "communityCard">("card");
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const isPremiumMode = demoMode === "premium";
  const communitySettings = getCommunityCardSettings();
  const hostMascot = getSelectedMascot(communitySettings);
  const hostAvatar = getAvatarDisplayLabel({ context: "tableHost", mascot: hostMascot, settings: communitySettings });
  const fullInviteCandidates = useMemo(() => getFullInviteCandidates(isPremiumMode), [isPremiumMode]);
  const sortedInviteCandidates = useMemo(() => sortInviteCandidates(fullInviteCandidates, activeSort, sortDirection), [activeSort, fullInviteCandidates, sortDirection]);
  const inviteCandidates = sortedInviteCandidates.slice(0, isPremiumMode ? 10 : 5);
  const participants = useMemo(() => getTableParticipants(), []);
  const selectedParticipant = participants.find((participant) => participant.id === selectedParticipantId) ?? participants[0];
  const activeTableChatTarget = activeTable
    ? {
        chatThreadId: activeTable.groupChatThreadId ?? `chat-group-${activeTable.tableId}`,
        tableId: activeTable.tableId,
        tableName: `四人桌｜${activeTable.restaurantName}`
      }
    : hostedTableChatTarget;
  const restaurantTableResults = useMemo(
    () => restaurantContext?.action === "find" ? rankExistingTablesForRestaurant(restaurantContext) : { exact: [], similar: [], visible: zhTW.mobile.groupTables.tables },
    [restaurantContext]
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
    setTableParticipantCount(nextTable.participantIds.length >= 4 ? 4 : 3);
    setMyTableView("card");
    focusGroupTableElementAfterRender("my-table-state-area");
  }, [restaurantContext]);

  useEffect(() => {
    if (restaurantContext?.action === "find") {
      focusGroupTableElementAfterRender("available-table-state-area");
    }
  }, [restaurantContext?.action, restaurantContext?.restaurantId]);

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
    setTableParticipantCount(activeTable.participantIds.length >= 4 ? 4 : 3);
  }, [activeTable?.tableId]);

  useEffect(() => {
    if (myTableView === "participants" || myTableView === "communityCard") {
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
      <Card tone={isPremiumMode ? "premium" : "mint"}>
        <PremiumBadge label={isPremiumMode ? zhTW.mobile.premiumUi.premiumBadge : zhTW.mobile.premiumUi.freeBadge} variant={isPremiumMode ? "premium" : "free"} />
        <SectionTitle title={isPremiumMode ? zhTW.mobile.correctedFlow.myTableTitle : zhTW.mobile.correctedFlow.freeTablePreviewTitle} subtitle={isPremiumMode ? zhTW.mobile.correctedFlow.activeTableLimitHint : zhTW.mobile.correctedFlow.freeTablePreviewBody} />
        {!isPremiumMode ? <TagRow tags={zhTW.mobile.correctedFlow.freeTablePreviewItems} /> : null}
        {isPremiumMode ? (
          <View style={styles.hostRow}>
            <View style={styles.hostAvatar}>
              <Text style={styles.participantText}>{hostAvatar}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.aaRule}>{zhTW.mobile.refinedLogic.avatar.tableHostRule}</Text>
              <Text style={styles.reason}>{zhTW.mobile.refinedLogic.avatar.tableHostTemporaryRule}</Text>
            </View>
          </View>
        ) : null}
      </Card>

      {moduleView === "invite" ? (
        <View nativeID="group-table-invite-mode">
        <InviteMode
          activeSort={activeSort}
          candidates={inviteCandidates}
          inviteSent={inviteSent}
          isPremiumMode={isPremiumMode}
          selectedIds={selectedInviteIds}
          onBack={() => setModuleView("tables")}
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
            const updated = updateActiveFourPersonTable({
              participantIds: ["demo-user", ...selectedInviteIds].slice(0, 4),
              status: "已成團",
              groupChatThreadId: hostedTableChatTarget.chatThreadId
            });
            if (updated) {
              setActiveTable(updated);
            }
            setModuleView("tables");
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

      {moduleView === "tables" ? (
        <>
        {isPremiumMode ? (
          <>
            <View nativeID="my-table-state-area">
            {myTableView === "card" ? (
              <MyTableOverview
                activeTable={activeTable}
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
              />
            ) : null}
            {myTableView === "participants" ? (
              <ParticipantsMode
                activeTable={activeTable}
                participants={participants}
                onBack={() => setMyTableView("card")}
                onOpenChat={() => onOpenChat?.(activeTableChatTarget)}
                onOpenParticipant={(id) => {
                  setSelectedParticipantId(id);
                  setMyTableView("communityCard");
                }}
              />
            ) : null}
            {myTableView === "communityCard" ? (
              <ParticipantCommunityCard participant={selectedParticipant} onBack={() => setMyTableView("participants")} />
            ) : null}
            </View>
          </>
        ) : null}
        <View nativeID="available-table-state-area">
          <Card tone="mint">
            <SectionTitle title={zhTW.mobile.groupTables.availableTablesTitle} subtitle={zhTW.mobile.groupTables.availableTablesBody} />
          </Card>
          {restaurantContext?.action === "find" ? (
            <RestaurantTableContextCard context={restaurantContext} exactCount={restaurantTableResults.exact.length} similarCount={restaurantTableResults.similar.length} />
          ) : null}
          {restaurantTables.map((table) => {
          const isJoined = joinedTable === table.mealTheme;
          const isCompleted = table.status === zhTW.mobile.groupTables.completedStatusLabel;
          const isLockedForFree = !isPremiumMode && table.premiumOnly;
          const shouldBlurParticipants = !isPremiumMode && !isCompleted;

          return (
            <Card key={table.mealTheme} tone={table.premiumOnly || isPremiumMode ? "premium" : "default"}>
              <View style={styles.tableHeader}>
                <View style={styles.flex}>
                  <View style={styles.badgeRow}>
                    <PremiumBadge label={table.premiumOnly || isPremiumMode ? zhTW.mobile.premiumUi.premiumTables : zhTW.mobile.premiumUi.freeBadge} variant={table.premiumOnly || isPremiumMode ? "premium" : "free"} />
                    {table.status === zhTW.mobile.groupTables.completedStatusLabel ? <PremiumBadge label={zhTW.mobile.groupTables.completedState} variant="free" /> : null}
                  </View>
                  <Text style={styles.restaurant}>{table.restaurantName}</Text>
                  <Text style={styles.theme}>{table.mealTheme}</Text>
                </View>
                <Text style={styles.progress}>{table.progress}</Text>
              </View>

              <TagRow tags={table.tags} />
              <Text style={styles.reason}>{table.reason}</Text>
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
            </Card>
          );
          })}
          {restaurantContext?.action === "find" && restaurantTables.length === 0 ? (
            <Card tone="mint">
              <SectionTitle title={restaurantContext.restaurantName} subtitle="目前這間餐廳還沒有可加入的四人桌，可以建立一桌。" />
            </Card>
          ) : null}
        </View>
        </>
      ) : null}

      <Card tone="mint">
        <SectionTitle title={zhTW.mobile.groupTables.detailTitle} subtitle={zhTW.mobile.groupTables.detailBody} />
      </Card>

      <Card tone="amber">
        <SectionTitle title={zhTW.mobile.groupTables.foodMemoryFitTitle} subtitle={zhTW.mobile.groupTables.foodMemoryFitBody} />
      </Card>

      <Card tone={isPremiumMode ? "premium" : "default"}>
        <PremiumBadge label={isPremiumMode ? zhTW.mobile.premiumUi.premiumBadge : zhTW.mobile.premiumUi.freeBadge} variant={isPremiumMode ? "premium" : "free"} />
        <Text style={styles.limitPill}>{isPremiumMode ? zhTW.mobile.premiumUi.premiumRemainingTableJoins : zhTW.mobile.premiumUi.remainingTableJoins}</Text>
        <ComparisonPreview
          freeTitle={zhTW.mobile.premiumUi.freeSeesTitle}
          premiumTitle={zhTW.mobile.premiumUi.premiumUnlocksTitle}
          freeItems={zhTW.mobile.groupTables.freePreview}
          premiumItems={zhTW.mobile.groupTables.premiumPreview}
        />
      </Card>

      <Card tone="premium">
        <PremiumBadge label={zhTW.mobile.premiumUi.premiumBadge} />
        <SectionTitle title={zhTW.common.premium} subtitle={zhTW.mobile.groupTables.premiumJoinLimit} />
      </Card>
    </>
  );
}

type InviteCandidate = {
  id: string;
  name: string;
  goal: string;
  lastTable: string;
  mealCount: number;
  knownDays: number;
  recentDays: number;
  tags: readonly string[];
};

function focusGroupTableElementAfterRender(elementId: string) {
  setTimeout(() => {
    const browserWindow = (globalThis as typeof globalThis & { window?: { document?: { getElementById?: (id: string) => { scrollIntoView?: (options?: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition }) => void } | null } } }).window;
    const element = browserWindow?.document?.getElementById?.(elementId);
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, 120);
}

type TableParticipant = InviteCandidate & {
  status: string;
  summary: string;
};

function getTableParticipants(): TableParticipant[] {
  return getFullInviteCandidates(true).slice(0, 4).map((candidate, index) => ({
    ...candidate,
    status: zhTW.mobile.correctedFlow.participantStatuses[index % zhTW.mobile.correctedFlow.participantStatuses.length],
    summary: zhTW.mobile.correctedFlow.participantSummary[index % zhTW.mobile.correctedFlow.participantSummary.length]
  }));
}

function addUnique(items: string[], id: string) {
  return items.includes(id) ? items : [...items, id];
}

function getFullInviteCandidates(isPremiumMode: boolean): InviteCandidate[] {
  const base = zhTW.mobile.mealBuddies.buddies;
  const names = isPremiumMode ? zhTW.mobile.refinedLogic.mealPartner.premiumNames : zhTW.mobile.refinedLogic.mealPartner.freeNames;
  return names.map((name, index) => {
    const buddy = base[index % base.length];
    return {
      id: name,
      name,
      goal: buddy.goal,
      lastTable: buddy.intent,
      mealCount: 12 - index,
      knownDays: 20 + index * 9,
      recentDays: (index % 6) + 1,
      tags: buddy.tags
    };
  });
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

function RestaurantTableContextCard({ context, exactCount, similarCount }: { context: RestaurantTableContext; exactCount: number; similarCount: number }) {
  return (
    <Card tone="mint">
      <PremiumBadge label="餐廳篩選" variant="free" />
      <SectionTitle
        title={`正在尋找：${context.restaurantName}`}
        subtitle={exactCount > 0 ? `優先顯示 ${exactCount} 個同餐廳餐桌。` : similarCount > 0 ? `目前沒有同餐廳餐桌，顯示 ${similarCount} 個相似類型餐桌。` : "目前沒有符合的餐桌。"}
      />
      <TagRow tags={context.restaurantTags.slice(0, 3)} />
    </Card>
  );
}

function MyTableOverview({ activeTable, onCreate, onInvite, onManage, onOpen, onOpenChat, onUpgradeCapacity, tableCapacity, tableParticipantCount }: { activeTable: ActiveFourPersonTable | null; onCreate: () => void; onInvite: () => void; onManage: () => void; onOpen: () => void; onOpenChat: () => void; onUpgradeCapacity: () => void; tableCapacity: 4 | 6 | 8; tableParticipantCount: 3 | 4 }) {
  return (
    <Card tone="premium">
      <PremiumBadge label={zhTW.mobile.correctedFlow.myTableTitle} />
      <SectionTitle title={zhTW.mobile.correctedFlow.myTableTitle} subtitle={zhTW.mobile.correctedFlow.activeTableLimitHint} />
      {!activeTable ? (
        <>
          <Text style={styles.reason}>{zhTW.mobile.correctedFlow.noActiveTable}</Text>
          <Pressable style={styles.joinButton} onPress={onCreate}>
            <Text style={styles.joinButtonText}>{zhTW.mobile.correctedFlow.startTable}</Text>
          </Pressable>
        </>
      ) : (
        <HostedTableCard activeTable={activeTable} onInvite={onInvite} onManage={onManage} onOpen={onOpen} onOpenChat={onOpenChat} onUpgradeCapacity={onUpgradeCapacity} tableCapacity={tableCapacity} tableParticipantCount={tableParticipantCount} />
      )}
    </Card>
  );
}

function HostedTableCard({ activeTable, onInvite, onManage, onOpen, onOpenChat, onUpgradeCapacity, tableCapacity, tableParticipantCount }: { activeTable: ActiveFourPersonTable; onInvite: () => void; onManage: () => void; onOpen?: () => void; onOpenChat?: () => void; onUpgradeCapacity: () => void; tableCapacity: 4 | 6 | 8; tableParticipantCount: 3 | 4 }) {
  return (
    <View style={styles.hostedTableCard}>
      <Pressable style={styles.hostedTableInfo} onPress={onOpen ?? onManage}>
        <Text style={styles.hostedTableName}>{activeTable.restaurantName}｜四人餐桌</Text>
        <Text style={styles.hostedTableMeta}>{zhTW.mobile.correctedFlow.tablePlaceLabel}: {activeTable.location || "待確認"}</Text>
        <Text style={styles.hostedTableMeta}>{zhTW.mobile.correctedFlow.tableTimeLabel}: {activeTable.suggestedTime}</Text>
        <Text style={styles.hostedTableMeta}>{zhTW.mobile.correctedFlow.currentPeoplePrefix}{tableParticipantCount}/{tableCapacity}</Text>
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
      </View>
    </View>
  );
}

function ParticipantsMode({ activeTable, onBack, onOpenChat, onOpenParticipant, participants }: { activeTable: ActiveFourPersonTable | null; onBack: () => void; onOpenChat: () => void; onOpenParticipant: (id: string) => void; participants: TableParticipant[] }) {
  const table = activeTable ?? {
    restaurantName: zhTW.mobile.correctedFlow.hostedTable.name,
    location: zhTW.mobile.correctedFlow.hostedTable.place,
    suggestedTime: zhTW.mobile.correctedFlow.hostedTable.time,
    maxParticipants: 4,
    participantIds: [],
    status: zhTW.mobile.correctedFlow.hostedTable.status
  };
  return (
    <Card tone="mint">
      <SectionTitle title={zhTW.mobile.correctedFlow.participantsTitle} subtitle={zhTW.mobile.correctedFlow.activeTableLimitHint} />
      <View style={styles.hostedTableCard}>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tableNameLabel}: {table.restaurantName}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tablePlaceLabel}: {table.location}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tableTimeLabel}: {table.suggestedTime}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tablePeopleLabel}: {table.participantIds.length}/{table.maxParticipants}</Text>
        <Text style={styles.theme}>{zhTW.mobile.correctedFlow.tableStatusLabel}: {table.status}</Text>
      </View>
      {participants.map((participant) => (
        <Pressable key={participant.id} style={styles.participantCard} onPress={() => onOpenParticipant(participant.id)}>
          <View style={styles.participantMiniAvatar}>
            <Text style={styles.participantText}>{participant.name.slice(0, 1)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.candidateName}>{participant.name}</Text>
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
    </Card>
  );
}

function ParticipantCommunityCard({ onBack, participant }: { onBack: () => void; participant: TableParticipant }) {
  return (
    <Card tone="premium">
      <Pressable style={styles.headerButton} onPress={onBack}>
        <Text style={styles.headerButtonText}>{zhTW.mobile.correctedFlow.backToParticipants}</Text>
      </Pressable>
      <SectionTitle title={zhTW.mobile.correctedFlow.communityCardTitle} subtitle={participant.summary} />
      <View style={styles.communityCardTop}>
        <View style={styles.communityAvatar}>
          <Text style={styles.participantText}>{participant.name.slice(0, 1)}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.restaurant}>{participant.name}</Text>
          <Text style={styles.aaRule}>{zhTW.mobile.correctedFlow.verifiedParticipant}</Text>
        </View>
      </View>
      <TagRow tags={participant.tags} />
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.commonMealInterests}: {participant.goal}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.commonArea}: {participant.lastTable}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.mealFriendCount}: {participant.mealCount}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.recentMealIntent}: {participant.lastTable}</Text>
      <Text style={styles.reason}>{zhTW.mobile.correctedFlow.socialIntro}: {participant.summary}</Text>
    </Card>
  );
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
    <Card tone="mint">
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

      <SectionTitle title={inviteSent ? zhTW.mobile.correctedFlow.inviteSuccess : zhTW.mobile.correctedFlow.inviteModeTitle} subtitle={zhTW.mobile.correctedFlow.inviteModeBody} />

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
    </Card>
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
    borderColor: "#f4c56f",
    borderWidth: 1,
    backgroundColor: "#a7b0aa"
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
    width: 74
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
    backgroundColor: colors.teal,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  joinButtonCompact: {
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: colors.teal,
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
    backgroundColor: "#ddf5e7"
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
    backgroundColor: "#fff3df",
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
    backgroundColor: colors.teal,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  disabledCompleteButton: {
    backgroundColor: "#b9c8bf"
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

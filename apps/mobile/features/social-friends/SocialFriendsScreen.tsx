import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Card, colors } from "../../components/DemoUi";
import { PlaceholderScreen } from "../../components/PlaceholderScreen";
import { useConsumerRuntime } from "../consumer-runtime";
import { MealBuddyRelationshipPanel } from "../meal-buddy-relationships/MealBuddyRelationshipPanel";
import { useMealBuddyRelationshipProfile } from "../meal-buddy-relationships/useMealBuddyRelationshipProfile";
import { SocialFriendsController } from "./controller";
import { getSocialFriendsRepository, type FriendCandidate, type FriendRequest, type FriendSettings } from "./repository";

type SearchView = {
    owner: string | null;
    generation: number;
    settings: FriendSettings | null;
    candidate: FriendCandidate | null;
    message: string;
    busy: boolean;
};

// A new actor/generation/ref mounts a fresh relationship context, with no prior person's actions.
function FoundFriend({ actor, generation, candidate }: { actor: string; generation: number; candidate: FriendCandidate }) {
    const router = useRouter();
    const relationship = useMealBuddyRelationshipProfile(actor, generation, candidate.candidateRef);
    const retry = useRef(relationship.retry), seen = useRef(false);
    retry.current = relationship.retry;
    useFocusEffect(useCallback(() => {
        if (!seen.current) { seen.current = true; return; } // Initial context already loads once.
        void retry.current();
    }, []));
    return <View>
        <Text>{candidate.displayName}</Text>
        <MealBuddyRelationshipPanel controller={relationship} onOpenChat={relationshipRef => {
            router.push({ pathname: "/meal-buddy-chat/[relationshipRef]", params: { relationshipRef } });
        }} />
    </View>;
}

export function SocialFriendsScreen() {
    const router = useRouter(), runtime = useConsumerRuntime();
    const actor = runtime.mode === "supabase" ? runtime.state.actorKey : null, generation = runtime.state.actorGeneration;
    const controller = useMemo(() => new SocialFriendsController(getSocialFriendsRepository()), [actor, generation]);
    const [view, setView] = useState<SearchView>({ owner: null, generation: -1, settings: null, candidate: null, message: "", busy: false });
    const [kind, setKind] = useState<"phone" | "code">("code"), [query, setQuery] = useState("");
    const active = useRef(controller);
    active.current = controller;
    const current = view.owner === actor && view.generation === generation ? view : null;
    useEffect(() => {
        let live = true;
        setQuery("");
        setView({ owner: actor, generation, settings: null, candidate: null, message: actor ? "正在讀取搜尋設定" : "請先登入，並完成社交成年確認與參與設定。", busy: !!actor });
        if (actor) void controller.execute(actor, { operation: "settings" }).then(result => {
            if (live && result && "settings" in result) setView({ owner: actor, generation, settings: result.settings, candidate: null, message: "", busy: false });
        }).catch(() => {
            if (live) setView({ owner: actor, generation, settings: null, candidate: null, message: "暫時無法讀取。請確認登入、18 歲確認及社交參與設定後重試。", busy: false });
        });
        return () => { live = false; controller.invalidate(); };
    }, [actor, generation, controller]);
    const execute = async (request: FriendRequest) => {
        if (!actor || !current || active.current !== controller || controller.isBusy()) return;
        const update = (change: (value: SearchView) => SearchView) => setView(value => value.owner === actor && value.generation === generation ? change(value) : value);
        update(value => ({ ...value, busy: true, candidate: null, message: "" }));
        try {
            const result = await controller.execute(actor, request);
            if (!result) return;
            if ("settings" in result) update(value => ({ ...value, busy: false, settings: result.settings, message: request.operation === "settings" ? "設定已讀取" : "設定已儲存" }));
            else if (result.status === "found") update(value => ({ ...value, busy: false, candidate: result.candidate, message: "請確認這是你認識的好友，再依目前關係狀態操作。" }));
            else update(value => ({ ...value, busy: false, message: result.status === "rate_limited" ? "搜尋次數過多，請稍後再試。" : "找不到可加入的好友。請對方確認邀請碼、已驗證手機及搜尋設定。" }));
        } catch {
            update(value => ({ ...value, busy: false, settings: request.operation === "lookup" ? value.settings : null, candidate: null, message: "暫時無法完成。請確認網路、登入與社交參與設定後重試。" }));
        }
    };
    const button = (label: string, action: () => void, disabled = false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={action} style={{ padding: 14, marginTop: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 14, opacity: disabled ? 0.5 : 1 }}><Text>{label}</Text></Pressable>;
    const unavailable = !actor || !current || current.busy;
    return <PlaceholderScreen title="新增好友" subtitle="用邀請碼或已註冊且驗證的完整手機號碼，找到你認識的人。">
        <Card><Text>搜尋設定</Text>
            {current?.settings ? <View>
                <Text selectable>邀請碼：{current.settings.inviteCode}</Text>
                <Text>{current.settings.searchable ? "已開啟被搜尋" : "已關閉被搜尋；現有好友不受影響。邀請碼與手機搜尋都不會找到你。"}</Text>
                {button(current.settings.searchable ? "關閉被搜尋" : "開啟被搜尋", () => { void execute({ operation: "set_searchable", searchable: !current.settings!.searchable }); }, unavailable)}
                {button("更換邀請碼", () => { void execute({ operation: "rotate_code" }); }, unavailable)}
            </View> : button("重試讀取設定", () => { void execute({ operation: "settings" }); }, unavailable)}
        </Card>
        <Card><Text>精確尋找好友</Text>
            {button(kind === "code" ? "改用完整手機號碼" : "改用邀請碼", () => {
                if (active.current !== controller || controller.isBusy()) return;
                setKind(kind === "code" ? "phone" : "code"); setQuery(""); setView(value => ({ ...value, candidate: null, message: "" }));
            }, unavailable)}
            <TextInput accessibilityLabel={kind === "code" ? "好友邀請碼" : "好友完整手機號碼"} value={current ? query : ""} editable={!unavailable} onChangeText={value => {
                if (active.current !== controller || controller.isBusy()) return;
                setQuery(value); setView(previous => ({ ...previous, candidate: null, message: "" }));
            }} maxLength={80} keyboardType={kind === "phone" ? "phone-pad" : "default"} autoCapitalize="none" autoCorrect={false} placeholder={kind === "phone" ? "例如 0912345678 或 +886912345678" : "輸入完整邀請碼"} style={{ borderWidth: 1, borderColor: colors.line, padding: 12, marginTop: 12 }} />
            {button("尋找好友", () => { void execute({ operation: "lookup", kind, value: query }); }, unavailable || !query.trim())}
            {actor && current?.candidate ? <FoundFriend key={`${actor}:${generation}:${current.candidate.candidateRef}`} actor={actor} generation={generation} candidate={current.candidate} /> : null}
        </Card>
        <Card>{current?.busy ? <ActivityIndicator /> : null}<Text accessibilityLiveRegion="polite">{current?.message ?? "正在切換帳號"}</Text>
            {button("回到好友清單", () => router.replace({ pathname: "/meal-buddies", params: { section: "friends" } }))}
        </Card>
    </PlaceholderScreen>;
}
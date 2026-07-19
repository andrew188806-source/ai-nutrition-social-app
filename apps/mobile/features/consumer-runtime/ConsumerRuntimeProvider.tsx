import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSegments } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { snowPalette as colors } from "../../theme/tokens";
import {
  getOrCreateConsumerRuntimeComposition,
  type ConsumerRuntimeErrorCode,
  type ConsumerRuntimeMode,
  type ConsumerRuntimeProfileState,
  type ConsumerRuntimeState
} from "./consumerRuntimeComposition";

export type ConsumerRuntimeContextValue = {
  state: ConsumerRuntimeState;
  mode: ConsumerRuntimeMode;
  configurationError: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  signInDemo(): Promise<boolean>;
  signOut(): Promise<boolean>;
  retryProfile(): Promise<boolean>;
};

const unavailableState: ConsumerRuntimeState = {
  authState: { status: "error", session: null },
  operation: "idle",
  actorKey: null,
  actorGeneration: 0,
  profileState: { status: "idle", profile: null, errorCode: null },
  errorCode: "configuration_error"
};

const ConsumerRuntimeContext = createContext<ConsumerRuntimeContextValue | null>(null);

export function ConsumerRuntimeProvider({ children }: { children: ReactNode }) {
  const compositionRef = useRef<ReturnType<typeof getOrCreateConsumerRuntimeComposition> | null>(null);
  if (!compositionRef.current) compositionRef.current = getOrCreateConsumerRuntimeComposition();
  const composition = compositionRef.current;
  const controller = composition.ok ? composition.value.controller : null;
  const [state, setState] = useState<ConsumerRuntimeState>(() => controller?.getState() ?? unavailableState);

  useEffect(() => {
    if (!controller) return;
    const unsubscribe = controller.subscribe(setState);
    void controller.start();
    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  const value = useMemo<ConsumerRuntimeContextValue>(() => ({
    state,
    mode: controller?.mode ?? "disabled",
    configurationError: !composition.ok,
    signIn: (email, password) => controller?.signIn(email, password) ?? Promise.resolve(false),
    signInDemo: () => controller?.signInDemo() ?? Promise.resolve(false),
    signOut: () => controller?.signOut() ?? Promise.resolve(false),
    retryProfile: () => controller?.retryProfile() ?? Promise.resolve(false)
  }), [composition.ok, controller, state]);

  return <ConsumerRuntimeContext.Provider value={value}>{children}</ConsumerRuntimeContext.Provider>;
}

export function useConsumerRuntime() {
  const value = useContext(ConsumerRuntimeContext);
  if (!value) throw new Error("useConsumerRuntime must be used inside ConsumerRuntimeProvider.");
  return value;
}

export function ConsumerRuntimeNavigationGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const runtime = useConsumerRuntime();
  const authStatus = runtime.state.authState.status;
  const onLoginRoute = String(segments[0] ?? "") === "login";
  const profileLoading = runtime.state.profileState.status === "loading";
  const signedInReady = authStatus === "signedIn" && !profileLoading;
  const signedOutLike = authStatus === "signedOut" || (authStatus === "error" && runtime.state.errorCode !== "configuration_error");

  useEffect(() => {
    if (signedOutLike && !onLoginRoute) router.replace("/login");
    if (signedInReady && onLoginRoute) router.replace("/");
  }, [onLoginRoute, router, signedInReady, signedOutLike]);

  if (runtime.configurationError || runtime.state.errorCode === "configuration_error") {
    return <RuntimeBoundary errorCode="configuration_error" />;
  }
  if (authStatus === "disabled" || runtime.state.errorCode === "account_disabled") {
    return <RuntimeBoundary errorCode="account_disabled" />;
  }
  if (authStatus === "initializing" || profileLoading) {
    return <RuntimeLoadingBoundary />;
  }
  if ((signedOutLike && !onLoginRoute) || (signedInReady && onLoginRoute)) {
    return <RuntimeLoadingBoundary />;
  }
  return <>{children}</>;
}

function RuntimeLoadingBoundary() {
  return (
    <View style={styles.boundary}>
      <ActivityIndicator color={colors.primaryDeep} size="large" />
      <Text style={styles.boundaryTitle}>{zhTW.mobile.consumerAuth.initializing}</Text>
    </View>
  );
}

function RuntimeBoundary({ errorCode }: { errorCode: ConsumerRuntimeErrorCode }) {
  const copy = errorCode === "account_disabled" ? zhTW.mobile.consumerAuth.accountDisabled : zhTW.mobile.consumerAuth.configurationError;
  return (
    <View style={styles.boundary}>
      <Text style={styles.boundaryTitle}>{copy.title}</Text>
      <Text style={styles.boundaryBody}>{copy.body}</Text>
    </View>
  );
}

export function ConsumerProfileStateNotice({ profileState, onRetry }: { profileState: ConsumerRuntimeProfileState; onRetry: () => void }) {
  if (profileState.status === "available" || profileState.status === "idle") return null;
  const copy = profileState.status === "notFound" ? zhTW.mobile.consumerAuth.profileNotFound : zhTW.mobile.consumerAuth.profileLoadError;
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{copy.title}</Text>
      <Text style={styles.boundaryBody}>{copy.body}</Text>
      {profileState.status === "error" ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryText}>{zhTW.mobile.consumerAuth.retry}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
    backgroundColor: colors.bg,
    padding: 28
  },
  boundaryTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  boundaryBody: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center"
  },
  notice: {
    gap: 8,
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.card,
    padding: 16
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center"
  },
  retryButton: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  retryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  }
});

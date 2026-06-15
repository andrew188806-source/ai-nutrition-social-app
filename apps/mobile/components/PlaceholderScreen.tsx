import { type Href, useRouter } from "expo-router";
import { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { PrimaryButton, SecondaryButton } from "../theme/components";
import { fonts, snowPalette as colors } from "../theme/tokens";
import { BottomNav } from "./DemoUi";

interface ActionLink {
  href: Href;
  label: string;
}

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
  primaryAction?: ActionLink;
  secondaryAction?: ActionLink;
}

export function PlaceholderScreen({ title, subtitle, children, primaryAction, secondaryAction }: PlaceholderScreenProps) {
  const router = useRouter();

  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {primaryAction || secondaryAction ? (
            <View style={styles.actions}>
              {primaryAction ? (
                <View style={styles.actionPrimary}>
                  <PrimaryButton label={primaryAction.label} onPress={() => router.push(primaryAction.href)} />
                </View>
              ) : null}
              {secondaryAction ? (
                <View style={styles.actionSecondary}>
                  <SecondaryButton label={secondaryAction.label} onPress={() => router.push(secondaryAction.href)} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.content}>{children ?? <Text style={styles.panelText}>{zhTW.common.demoOnly}</Text>}</View>
        <Text style={styles.disclaimer}>{zhTW.common.notMedical}</Text>
        <BottomNav />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    gap: 22
  },
  header: {
    gap: 10,
    paddingTop: 8
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontFamily: fonts.black,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.sub,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.body
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4
  },
  actionPrimary: {
    flex: 1.25
  },
  actionSecondary: {
    flex: 1
  },
  content: {
    gap: 16
  },
  panelText: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fonts.body
  },
  disclaimer: {
    color: colors.sub,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.body
  }
});

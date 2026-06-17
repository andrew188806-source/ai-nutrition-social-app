import { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { zhTW } from "../../../lib/i18n/zh-TW";
import { fonts, snowPalette as colors } from "../theme/tokens";
import { BottomNav } from "./DemoUi";

interface PlaceholderScreenProps {
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export function PlaceholderScreen({ title, subtitle, children }: PlaceholderScreenProps) {
  return (
    <View style={styles.shell}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
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

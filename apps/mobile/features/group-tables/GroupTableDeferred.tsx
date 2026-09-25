import { Text, View } from "react-native";
import { zhTW } from "../../../../lib/i18n/zh-TW";
import { Card, SectionHeader } from "../../theme/components";
import { fonts, snowPalette as colors } from "../../theme/tokens";

export function GroupTableDeferred({ fromRestaurant = false }: { fromRestaurant?: boolean }) {
  const copy = zhTW.mobile.groupTables;
  return (
    <View style={{ padding: 20 }}>
      <Card>
        <SectionHeader title={copy.deferredTitle} subtitle={copy.deferredStatus} />
        <Text style={{ color: colors.sub, fontFamily: fonts.body, marginTop: 12 }}>
          {fromRestaurant ? copy.deferredRestaurantBody : copy.deferredBody}
        </Text>
      </Card>
    </View>
  );
}

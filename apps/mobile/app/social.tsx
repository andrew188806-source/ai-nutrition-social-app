import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Card, SectionTitle, colors } from "../components/DemoUi";
import { PlaceholderScreen } from "../components/PlaceholderScreen";
export default function SocialScreen() {
    const router = useRouter();
    return <PlaceholderScreen title="好友一起吃飯" subtitle="先和認識的人保持聯絡，再一起安排下一餐。">
  <Card><SectionTitle title="我的好友" subtitle="查看好友、邀請與持續的聊天室。"/>
   <Pressable accessibilityRole="button" onPress={() => router.push("/meal-buddies?section=friends")} style={{ padding: 16, backgroundColor: colors.mint, borderRadius: 16, marginTop: 12 }}><Text>開啟好友清單</Text></Pressable>
   <Pressable accessibilityRole="button" onPress={() => router.push("/social-friends")} style={{ padding: 16 }}><Text>用邀請碼或完整手機新增好友</Text></Pressable>
  </Card>
  <Card><SectionTitle title="飯友活動" subtitle="目前沒有開放中的陌生飯友活動。活動開放時，可在這裡查看飯友卡與認識新朋友。"/></Card>
  <Card><SectionTitle title="你的身份" subtitle="好友可看到你的顯示名稱與吉祥物。搜尋設定只影響新搜尋，不會刪除現有好友。社交功能限 18 歲以上。"/></Card>
 </PlaceholderScreen>;
}

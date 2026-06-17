import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";

export default function LoginScreen() {
  return (
    <PlaceholderScreen
      title={zhTW.mobile.loginTitle}
      subtitle={zhTW.mobile.loginSubtitle}
    />
  );
}

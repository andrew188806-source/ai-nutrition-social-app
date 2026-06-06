import { PlaceholderScreen } from "../components/PlaceholderScreen.tsx";
import { zhTW } from "../../../lib/i18n/zh-TW";

export default function LoginScreen() {
  return (
    <PlaceholderScreen
      title={zhTW.mobile.loginTitle}
      subtitle={zhTW.mobile.loginSubtitle}
      primaryAction={{ href: "/meal-photo", label: zhTW.mobile.startDemo }}
      secondaryAction={{ href: "/", label: zhTW.common.backHome }}
    />
  );
}

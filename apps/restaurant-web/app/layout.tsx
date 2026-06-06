import "./globals.css";
import type { ReactNode } from "react";
import { zhTW } from "../../../lib/i18n/zh-TW";

export const metadata = {
  title: zhTW.restaurant.appName
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body>{children}</body>
    </html>
  );
}

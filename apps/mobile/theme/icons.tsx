import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "home"
  | "chart"
  | "buddies"
  | "plate"
  | "user"
  | "plus"
  | "share"
  | "heart"
  | "lock"
  | "spark"
  | "chevron"
  | "clock"
  | "leaf"
  | "flame"
  | "camera"
  | "check"
  | "star"
  | "target"
  | "edit"
  | "gear"
  | "shield"
  | "bookmark"
  | "table4"
  | "invite"
  | "arrowUp"
  | "chat"
  | "pin"
  | "search"
  | "send"
  | "users"
  | "calendar";

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

export function Icon({ name, size = 22, color = "#2C2722", strokeWidth = 2, filled = false }: IconProps) {
  const fill = filled ? color : "none";
  const shared = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderIcon(name, shared)}
    </Svg>
  );
}

function renderIcon(name: IconName, shared: { stroke: string; strokeWidth: number; strokeLinecap: "round"; strokeLinejoin: "round"; fill: string }) {
  switch (name) {
    case "home":
      return (
        <>
          <Path d="M3 11.5 12 4l9 7.5" {...shared} />
          <Path d="M5 10v9a1 1 0 0 0 1 1h4v-5h4v5h4a1 1 0 0 0 1-1v-9" {...shared} />
        </>
      );
    case "chart":
      return (
        <>
          <Path d="M4 20V11" {...shared} />
          <Path d="M10 20V6" {...shared} />
          <Path d="M16 20V14" {...shared} />
          <Path d="M3 20h18" {...shared} />
        </>
      );
    case "buddies":
      return (
        <>
          <Circle cx="8.5" cy="7" r="3" {...shared} />
          <Circle cx="16" cy="8" r="2.5" {...shared} />
          <Path d="M2.5 20c0-3.6 2.7-6.5 6-6.5s6 2.9 6 6.5" {...shared} />
          <Path d="M14.5 13.8c2.6.3 4.5 2.5 4.5 5.2" {...shared} />
        </>
      );
    case "plate":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...shared} />
          <Circle cx="12" cy="12" r="4" {...shared} />
        </>
      );
    case "user":
      return (
        <>
          <Circle cx="12" cy="8" r="4" {...shared} />
          <Path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" {...shared} />
        </>
      );
    case "plus":
      return (
        <>
          <Path d="M12 5v14" {...shared} />
          <Path d="M5 12h14" {...shared} />
        </>
      );
    case "share":
      return (
        <>
          <Path d="M12 15V4" {...shared} />
          <Path d="M8 8l4-4 4 4" {...shared} />
          <Path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" {...shared} />
        </>
      );
    case "heart":
      return <Path d="M12 20.5C12 20.5 3 15.5 3 9.5A4.5 4.5 0 0 1 12 7.8 4.5 4.5 0 0 1 21 9.5C21 15.5 12 20.5 12 20.5Z" {...shared} />;
    case "lock":
      return (
        <>
          <Rect x="5" y="11" width="14" height="9" rx="2" {...shared} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...shared} />
        </>
      );
    case "spark":
      return <Path d="M12 2 13.8 9.2 21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8Z" {...shared} />;
    case "chevron":
      return <Path d="M9 5l7 7-7 7" {...shared} />;
    case "clock":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...shared} />
          <Path d="M12 7v5l3 3" {...shared} />
        </>
      );
    case "leaf":
      return (
        <>
          <Path d="M5 21C5 12 11 5 21 4 20 14 13 21 5 21Z" {...shared} />
          <Path d="M5 21c2-3 5-6 9-8" {...shared} />
        </>
      );
    case "flame":
      return <Path d="M12 2c2.2 3.2-0.8 5.1-1 7.6a2.6 2.6 0 0 0 5.2 0.3c1.6 1.6 2.8 4 2.8 6.3a7 7 0 1 1-14 0c0-5.4 4-9.8 7-14.2Z" {...shared} />;
    case "camera":
      return (
        <>
          <Rect x="2" y="7" width="20" height="13" rx="2" {...shared} />
          <Path d="M8 7l1.4-2.2A2 2 0 0 1 11 4h2a2 2 0 0 1 1.6.8L16 7" {...shared} />
          <Circle cx="12" cy="13.5" r="3.5" {...shared} />
        </>
      );
    case "check":
      return <Path d="M5 12.5l4.5 4.5L19 7" {...shared} />;
    case "star":
      return <Path d="M12 2.5l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 16.9 6.3 20l1.1-6.3-4.6-4.5 6.4-.9Z" {...shared} />;
    case "target":
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...shared} />
          <Circle cx="12" cy="12" r="5" {...shared} />
          <Circle cx="12" cy="12" r="1.3" {...shared} />
        </>
      );
    case "edit":
      return (
        <>
          <Path d="M4 20h4l11-11a2 2 0 0 0 0-2.8L17.8 5a2 2 0 0 0-2.8 0L4 16Z" {...shared} />
          <Path d="M14 6.5l3.5 3.5" {...shared} />
        </>
      );
    case "gear":
      return (
        <>
          <Circle cx="12" cy="12" r="3.2" {...shared} />
          <Path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" {...shared} />
        </>
      );
    case "shield":
      return <Path d="M12 3l7 2.5v5.8c0 4.6-3 8.2-7 9.7-4-1.5-7-5.1-7-9.7V5.5Z" {...shared} />;
    case "bookmark":
      return <Path d="M6 3h12a1 1 0 0 1 1 1v16.5L12 16.5 5 20.5V4a1 1 0 0 1 1-1Z" {...shared} />;
    case "table4":
      return (
        <>
          <Rect x="8.5" y="8.5" width="7" height="7" rx="1.4" {...shared} />
          <Circle cx="4" cy="4" r="2" {...shared} />
          <Circle cx="20" cy="4" r="2" {...shared} />
          <Circle cx="4" cy="20" r="2" {...shared} />
          <Circle cx="20" cy="20" r="2" {...shared} />
        </>
      );
    case "invite":
      return (
        <>
          <Circle cx="9" cy="8" r="3.2" {...shared} />
          <Path d="M2.5 20c0-3.7 2.9-6.5 6.5-6.5s6.5 2.8 6.5 6.5" {...shared} />
          <Path d="M18 7v4M16 9h4" {...shared} />
        </>
      );
    case "arrowUp":
      return (
        <>
          <Path d="M12 19V5" {...shared} />
          <Path d="M5.5 11.5 12 5l6.5 6.5" {...shared} />
        </>
      );
    case "chat":
      return <Path d="M20.5 11.5c0 4.7-3.8 8.5-8.5 8.5-1.2 0-2.3-.2-3.4-.7L3.5 21l1.2-4.1A8.4 8.4 0 0 1 3.5 11.5C3.5 6.8 7.3 3 12 3s8.5 3.8 8.5 8.5Z" {...shared} />;
    case "pin":
      return (
        <>
          <Path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" {...shared} />
          <Circle cx="12" cy="10" r="2.4" {...shared} />
        </>
      );
    case "search":
      return (
        <>
          <Circle cx="11" cy="11" r="6.5" {...shared} />
          <Path d="M16 16l4.5 4.5" {...shared} />
        </>
      );
    case "send":
      return <Path d="M3 11.5 21 3l-7.5 18-2.5-7.5L3 11.5Z" {...shared} />;
    case "users":
      return (
        <>
          <Circle cx="9" cy="8" r="3" {...shared} />
          <Circle cx="17" cy="9.5" r="2.4" {...shared} />
          <Path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" {...shared} />
          <Path d="M15 14c2.5.3 4.5 2.4 4.5 5" {...shared} />
        </>
      );
    case "calendar":
      return (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...shared} />
          <Path d="M3 9.5h18" {...shared} />
          <Path d="M8 3v3M16 3v3" {...shared} />
        </>
      );
    default:
      return <Circle cx="12" cy="12" r="9" {...shared} />;
  }
}

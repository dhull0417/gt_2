import { LayoutAnimation, Platform, UIManager } from "react-native";
import { DAY_COLORS_LIGHT } from "@/utils/scheduleConstants";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const DAY_COLORS_DARK: { bg: string; fg: string }[] = [
    { bg: "#3B1E1E", fg: "#F87171" }, // Sunday (red)
    { bg: "#1A2A42", fg: "#60A5FA" }, // Monday (blue)
    { bg: "#241B3D", fg: "#A78BFA" }, // Tuesday (purple)
    { bg: "#132A1E", fg: "#34D399" }, // Wednesday (green)
    { bg: "#3A2E12", fg: "#FBBF24" }, // Thursday (amber)
    { bg: "#3A1F2E", fg: "#F472B6" }, // Friday (pink — no exact spec given, approximated to match the pattern)
    { bg: "#123338", fg: "#22D3EE" }, // Saturday (cyan)
];
export const getDayColors = (isDark: boolean) => isDark ? DAY_COLORS_DARK : DAY_COLORS_LIGHT;






export const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

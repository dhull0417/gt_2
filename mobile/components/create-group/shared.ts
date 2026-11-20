import { LayoutAnimation, Platform, UIManager } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

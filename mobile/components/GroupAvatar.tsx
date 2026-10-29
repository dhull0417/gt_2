import React from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { useThemeColors } from '@/contexts/AppearanceContext';

const COLORS = ["#C7D2FE", "#FDE68A", "#F9A8D4", "#FDBA74", "#A5B4FC", "#86EFAC", "#BAE6FD"];

function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % COLORS.length;
  return COLORS[hash];
}

interface Props {
  name: string;
  imageUrl?: string | null;
  size?: number;
  // Defaults to a full circle (size / 2). Pass a smaller value for a squircle look.
  borderRadius?: number;
}

// Avatar fill colors are fixed pastel badges independent of app theme (the initial's
// dark text stays readable on them regardless of light/dark mode), so only the
// image-loading placeholder background is theme-aware.
export const GroupAvatar: React.FC<Props> = ({ name, imageUrl, size = 44, borderRadius }) => {
  const colors = useThemeColors();
  const radius = borderRadius ?? size / 2;
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const bg = pickColor(name ?? "");

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.backgroundAlt }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={imageUrl}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: "700", color: "#374151" }}>
        {initial}
      </Text>
    </View>
  );
};

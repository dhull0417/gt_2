import React from "react";
import { Image, View, Text } from "react-native";

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
}

export const GroupAvatar: React.FC<Props> = ({ name, imageUrl, size = 44 }) => {
  const radius = size / 2;
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const bg = pickColor(name ?? "");

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: "#F3F4F6" }}
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

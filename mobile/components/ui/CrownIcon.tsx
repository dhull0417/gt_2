import Svg, { Path } from "react-native-svg";

// Crown outline in a 24×24 box, stroke-styled to match Feather (Feather has no crown). Based on Lucide's "crown" (ISC).
export const CROWN_PATH =
    "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z M5 21h14";

export function CrownIcon({ size = 24, color = "#000", strokeWidth = 2 }: { size?: number; color?: string; strokeWidth?: number }) {
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={CROWN_PATH} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
    );
}

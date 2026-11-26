// Gold shared by every Premium piece (pill, highlight, submit button, Profile row, Premium screen), light and dark.
export const PREMIUM_GOLD = "#D4A017";

export const premiumColors = (isDark: boolean) => ({
    accent: isDark ? "#F2C94C" : "#8A5A00",
    chipBg: isDark ? "#2A2110" : "#FDF6E3",
    chipBorder: isDark ? "#4A3A14" : "#F3E3B5",
    pillText: isDark ? "#F2C94C" : "#8A5A00",
});

/**
 * Gold gradients for Premium. `text` is for words and icons: deeper in light mode so it reads on white.
 * `edge` is for borders. Each has a `shine`, the light band that sweeps across (see GoldShine).
 */
export const premiumGold = (isDark: boolean) => ({
    text: isDark ? ["#E8B931", "#F7D774", "#E8B931"] : ["#8A5A00", "#B8860B", "#8A5A00"],
    textShine: isDark ? "#FFF8DC" : "#E9C46A",
    edge: isDark ? ["#C9971C", "#F2C94C", "#C9971C"] : ["#D4A017", "#EFC75E", "#D4A017"],
    edgeShine: isDark ? "#FFF6CF" : "#FFF3C4",
    glow: isDark ? "rgba(245,197,66,0.16)" : "rgba(234,179,8,0.14)",
    sparkle: isDark ? "#FFE79A" : "#D4A017",
    // Crown on a solid gold tab (PremiumHighlight).
    onGold: "#3A2A05",
});

// Purple accent shared by the Premium pieces of the schedule screens, light and dark.
export const PREMIUM_PURPLE = "#7C3AED";

export const premiumColors = (isDark: boolean) => ({
    accent: isDark ? "#A78BFA" : PREMIUM_PURPLE,
    chipBg: isDark ? "#241B3D" : "#F5F3FF",
    chipBorder: isDark ? "#3B2E63" : "#DDD6FE",
    pillText: isDark ? "#C4B5FD" : PREMIUM_PURPLE,
});

// Pastel rainbow for the Premium card's edge. Stops blend into each other (see PremiumFeaturesCard).
export const PREMIUM_RAINBOW = ["#FCA5A5", "#FDBA74", "#FDE68A", "#86EFAC", "#7DD3FC", "#A5B4FC", "#D8B4FE", "#F9A8D4"];

// Deeper shades of the same rainbow, for text and icons on a light background (the pastels are too faint to read there).
export const PREMIUM_RAINBOW_DEEP = ["#EF4444", "#F97316", "#D97706", "#16A34A", "#0284C7", "#4F46E5", "#9333EA", "#DB2777"];

import { useId, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { useAppearance, useThemeColors } from "@/contexts/AppearanceContext";
import { premiumColors, PREMIUM_RAINBOW, PREMIUM_RAINBOW_DEEP } from "@/components/schedule/premiumColors";

type FeatherName = keyof typeof Feather.glyphMap;

const MANAGE_URL = Platform.OS === "ios"
    ? "https://apps.apple.com/account/subscriptions"
    : "https://play.google.com/store/account/subscriptions";

// Feather's "star" outline, in its 24×24 box.
const STAR_POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";
const HERO_RADIUS = 24;
const EDGE = 2.5;

/**
 * What every Premium feature does and where to find it. Note: Waitlist is still free for every
 * group until PREMIUM_WAITLIST_ENFORCED is turned on (see the cutover runbook); listed here by the owner's choice.
 */
export const PREMIUM_FEATURES: { key: string; icon: FeatherName; title: string; description: string; where: string }[] = [
    { key: "waitlist", icon: "list", title: "Waitlist", description: "When a meetup is full, people join a waitlist and move up automatically when a spot opens.", where: "Automatic when a meetup has a max" },
    { key: "minimum", icon: "flag", title: "Minimum to Meet", description: "Cancel a meetup automatically if too few people are in when RSVPs close.", where: "Edit schedule → RSVP Rules" },
    { key: "bring", icon: "shopping-bag", title: "Things to bring", description: "People pick what they're bringing when they RSVP, with optional limits.", where: "Edit schedule → Premium" },
    { key: "rides", icon: "truck", title: "Rides", description: "See who's driving, how many seats they have, and who needs a ride.", where: "Edit schedule → Premium" },
    { key: "priority", icon: "award", title: "Priority RSVP", description: "Let chosen members RSVP first, in tiers with their own head start.", where: "Edit schedule → Premium" },
    { key: "questions", icon: "help-circle", title: "RSVP questions", description: "Ask up to 5 questions when people RSVP, like dietary needs or skill level.", where: "Edit schedule → Premium" },
    { key: "reactions", icon: "smile", title: "Custom RSVP reactions", description: "Your own catchphrases and emoji bursts when people tap In or Out.", where: "Group settings → RSVP Reactions" },
    { key: "teams", icon: "shuffle", title: "Team splits", description: "Shuffle everyone who's In into 2 to 8 teams, or set teams by hand.", where: "Meetup details" },
    { key: "stats", icon: "bar-chart-2", title: "Stats & attendance", description: "Attendance rates, streaks and history, with a CSV export.", where: "Group settings → Stats" },
];

/** The Premium screen for someone who already has Premium: a celebratory header, then everything it unlocks. */
export function PremiumActiveView({ onClose }: { onClose: () => void }) {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const isDark = scheme === "dark";
    const pc = premiumColors(isDark);
    const [hero, setHero] = useState({ width: 0, height: 0 });
    const [titleWidth, setTitleWidth] = useState(0);
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const deep = isDark ? PREMIUM_RAINBOW : PREMIUM_RAINBOW_DEEP;

    const stops = (colorsList: string[], opacity = 1) =>
        colorsList.map((c, i) => <Stop key={c} offset={i / (colorsList.length - 1)} stopColor={c} stopOpacity={opacity} />);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top", "left", "right"]}>
            <View style={styles.topBar}>
                <PressableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close" style={[styles.closeBtn, { backgroundColor: colors.surfaceAlt }]}>
                    <Feather name="x" size={20} color={colors.textSecondary} />
                </PressableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>
                {/* Hero: rainbow edge with a soft rainbow wash inside. */}
                <View
                    style={styles.heroEdge}
                    onLayout={e => {
                        const { width, height } = e.nativeEvent.layout;
                        setHero(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
                    }}
                >
                    {hero.width > 0 && (
                        <Svg style={StyleSheet.absoluteFill} width={hero.width} height={hero.height} pointerEvents="none">
                            <Defs>
                                <LinearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">{stops(PREMIUM_RAINBOW, isDark ? 0.85 : 1)}</LinearGradient>
                            </Defs>
                            <Rect x={0} y={0} width={hero.width} height={hero.height} rx={HERO_RADIUS} ry={HERO_RADIUS} fill={`url(#${id}-edge)`} />
                        </Svg>
                    )}
                    <View style={[styles.heroInner, { backgroundColor: colors.surface }]}>
                        {hero.width > 0 && (
                            <Svg style={StyleSheet.absoluteFill} width={hero.width - EDGE * 2} height={hero.height - EDGE * 2} pointerEvents="none">
                                <Defs>
                                    <LinearGradient id={`${id}-wash`} x1="0" y1="0" x2="1" y2="1">{stops(PREMIUM_RAINBOW, isDark ? 0.14 : 0.22)}</LinearGradient>
                                </Defs>
                                <Rect x={0} y={0} width={hero.width - EDGE * 2} height={hero.height - EDGE * 2} rx={HERO_RADIUS - EDGE} ry={HERO_RADIUS - EDGE} fill={`url(#${id}-wash)`} />
                            </Svg>
                        )}

                        <View style={[styles.starChip, { backgroundColor: pc.chipBg, borderColor: pc.chipBorder }]}>
                            <Svg width={36} height={36} viewBox="0 0 24 24">
                                <Defs>
                                    <LinearGradient id={`${id}-star`} x1="0" y1="0" x2="1" y2="1">{stops(deep)}</LinearGradient>
                                </Defs>
                                <Polygon points={STAR_POINTS} fill="none" stroke={`url(#${id}-star)`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                            </Svg>
                        </View>

                        {/* Gradient title, drawn as SVG so the rainbow can fill the words. */}
                        <View style={{ alignSelf: "stretch", height: 40, marginTop: 14 }} onLayout={e => setTitleWidth(Math.round(e.nativeEvent.layout.width))}
                            accessible accessibilityRole="header" accessibilityLabel="You're Premium">
                            {titleWidth > 0 && (
                                <Svg width={titleWidth} height={40}>
                                    <Defs>
                                        <LinearGradient id={`${id}-title`} gradientUnits="userSpaceOnUse" x1={titleWidth * 0.18} y1={0} x2={titleWidth * 0.82} y2={0}>{stops(deep)}</LinearGradient>
                                    </Defs>
                                    <SvgText x={titleWidth / 2} y={30} textAnchor="middle" fontSize={30} fontWeight="900" fill={`url(#${id}-title)`}>
                                        You're Premium
                                    </SvgText>
                                </Svg>
                            )}
                        </View>

                        <Text style={[styles.heroText, { color: colors.textSecondary }]}>
                            Every group you own has the full GroupThat toolkit. Thanks for supporting GroupThat!
                        </Text>
                    </View>
                </View>

                <Text style={[styles.sectionLabel, { color: colors.textFaint }]}>Everything you've unlocked</Text>
                <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {PREMIUM_FEATURES.map((f, i) => (
                        <View key={f.key} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                            <View style={[styles.rowIcon, { backgroundColor: pc.chipBg }]}>
                                <Feather name={f.icon} size={17} color={pc.accent} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <View style={styles.rowTitleLine}>
                                    <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                                    <Feather name="check" size={16} color={colors.success} />
                                </View>
                                <Text style={[styles.rowText, { color: colors.textMuted }]}>{f.description}</Text>
                                <Text style={[styles.rowWhere, { color: colors.textFaint }]}>{f.where}</Text>
                            </View>
                        </View>
                    ))}
                </View>

                <PressableOpacity onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})} style={styles.manageBtn}>
                    <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 15 }}>Manage subscription</Text>
                </PressableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 8 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    scroll: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },
    heroEdge: { borderRadius: HERO_RADIUS, padding: EDGE, overflow: "hidden" },
    heroInner: { borderRadius: HERO_RADIUS - EDGE, paddingVertical: 28, paddingHorizontal: 22, alignItems: "center", overflow: "hidden" },
    starChip: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    heroText: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 6 },
    sectionLabel: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 28, marginBottom: 10, marginLeft: 4 },
    list: { borderRadius: 18, borderWidth: 1, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
    rowIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
    rowTitle: { fontSize: 15, fontWeight: "800" },
    rowText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
    rowWhere: { fontSize: 12, fontWeight: "600", marginTop: 4 },
    manageBtn: { alignSelf: "center", marginTop: 24, paddingVertical: 8, paddingHorizontal: 12 },
});

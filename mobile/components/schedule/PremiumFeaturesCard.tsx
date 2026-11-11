import { useId, useState } from "react";
import { LayoutAnimation, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { PressableOpacity } from "@/components/ui/PressableOpacity";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { UpgradeButton } from "@/components/UpgradeButton";
import { useAppearance, useThemeColors } from "@/contexts/AppearanceContext";
import { getBringItemsError, newBringItemKey, type BringItemDraft } from "@/utils/editScheduleDraft";
import { premiumSectionSummary } from "@/utils/premiumSection";
import { premiumColors, PREMIUM_RAINBOW } from "./premiumColors";
import { PremiumPill } from "./PremiumPill";

type FeatherName = keyof typeof Feather.glyphMap;

/** A Premium setting that lives on its own screen (priority RSVP, RSVP questions). */
export interface PremiumLink {
    key: string;
    icon: FeatherName;
    title: string;
    /** One line under the title. */
    subtitle: string;
    /** Opens the setting. Leave out when it can't be set up yet; the row then shows as unavailable. */
    onPress?: () => void;
}

const MAX_ITEMS = 20;

/**
 * The Premium card at the bottom of a schedule form: things to bring, rides, and links to the
 * settings that have their own screens. Without Premium it shows one upgrade prompt and the
 * features as locked rows. With `collapsible`, it starts closed and opens when the header is tapped.
 */
export function PremiumFeaturesCard({
    isPremium, owner, lockedNote, collapsible = false, bringItems, ridesEnabled, onChange, links = [], style,
}: {
    isPremium: boolean;
    owner?: string | { _id: string } | null;
    /** Line under the upgrade prompt when locked (who needs Premium). */
    lockedNote: string;
    collapsible?: boolean;
    bringItems: BringItemDraft[];
    ridesEnabled: boolean;
    onChange: (patch: { bringItems?: BringItemDraft[]; ridesEnabled?: boolean }) => void;
    links?: PremiumLink[];
    style?: StyleProp<ViewStyle>;
}) {
    const colors = useThemeColors();
    const { scheme } = useAppearance();
    const pc = premiumColors(scheme === "dark");
    const [open, setOpen] = useState(!collapsible);
    // SVG gradient ids are document-wide, so each card needs its own.
    // Percent sizes don't reliably fill an absolutely positioned Svg, so measure the card and size it exactly.
    const [edgeSize, setEdgeSize] = useState({ width: 0, height: 0 });
    const gradientId = `premiumEdge-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

    const toggle = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setOpen(o => !o);
    };

    const subtitle = !isPremium
        ? "Unlock more for your meetups"
        : premiumSectionSummary(bringItems, ridesEnabled);
    const itemsError = getBringItemsError(bringItems);

    const header = (
        <View style={styles.headerRow}>
            <View style={[styles.iconChip, { backgroundColor: pc.chipBg, borderColor: pc.chipBorder }]}>
                <Feather name="star" size={16} color={pc.accent} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>Premium</Text>
                {(collapsible || !isPremium) && (
                    <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
                )}
            </View>
            {isPremium
                ? <PremiumPill label="Active" icon={false} />
                : <Feather name="lock" size={16} color={colors.textFaint} />}
            {collapsible && (
                <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textFaint} style={{ marginLeft: 6 }} />
            )}
        </View>
    );

    const lockedRows: { key: string; icon: FeatherName; title: string; subtitle: string }[] = [
        { key: "bring", icon: "shopping-bag", title: "Things to bring", subtitle: "Ask people what they're bringing." },
        { key: "rides", icon: "truck", title: "Rides", subtitle: "Coordinate drivers and seats." },
        ...links.map(l => ({ key: l.key, icon: l.icon, title: l.title, subtitle: l.subtitle })),
    ];

    return (
        <View
            style={[styles.cardEdge, { backgroundColor: colors.surface }, style]}
            onLayout={e => {
                const { width, height } = e.nativeEvent.layout;
                setEdgeSize(prev => (prev.width === width && prev.height === height ? prev : { width, height }));
            }}
        >
            {/* Soft rainbow edge: a gradient fills the outer view and the card's surface sits inset by the edge width. */}
            {edgeSize.width > 0 && (
            <Svg style={{ position: "absolute", top: 0, left: 0 }} width={edgeSize.width} height={edgeSize.height} pointerEvents="none">
                <Defs>
                    <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                        {PREMIUM_RAINBOW.map((c, i) => (
                            <Stop key={c} offset={i / (PREMIUM_RAINBOW.length - 1)} stopColor={c} stopOpacity={scheme === "dark" ? 0.85 : 1} />
                        ))}
                    </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={edgeSize.width} height={edgeSize.height} rx={CARD_RADIUS} ry={CARD_RADIUS} fill={`url(#${gradientId})`} />
            </Svg>
            )}
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {collapsible ? (
                <PressableOpacity
                    onPress={toggle}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={`Premium settings, ${open ? "collapse" : "expand"}`}
                >
                    {header}
                </PressableOpacity>
            ) : header}

            {open && (
                <View style={{ marginTop: 16 }}>
                    {!isPremium ? (
                        <>
                            <View style={[styles.upsell, { backgroundColor: pc.chipBg, borderColor: pc.chipBorder }]}>
                                <Text style={[styles.upsellTitle, { color: colors.textPrimary }]}>Get more out of every meetup</Text>
                                <Text style={[styles.help, { color: colors.textMuted, marginTop: 4 }]}>{lockedNote}</Text>
                                <UpgradeButton owner={owner} />
                            </View>
                            {lockedRows.map((r, i) => (
                                <View key={r.key} style={[styles.featureRow, i > 0 && styles.divider, i > 0 && { borderTopColor: colors.border }, { opacity: 0.7 }]}>
                                    <View style={[styles.featureIcon, { backgroundColor: colors.surfaceAlt }]}>
                                        <Feather name={r.icon} size={15} color={colors.textMuted} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.featureTitle, { color: colors.textSecondary }]}>{r.title}</Text>
                                        <Text style={[styles.help, { color: colors.textMuted }]}>{r.subtitle}</Text>
                                    </View>
                                    <Feather name="lock" size={14} color={colors.textFaint} />
                                </View>
                            ))}
                        </>
                    ) : (
                        <>
                            {/* Things to bring */}
                            <View style={styles.featureRow}>
                                <View style={[styles.featureIcon, { backgroundColor: pc.chipBg }]}>
                                    <Feather name="shopping-bag" size={15} color={pc.accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.featureTitle, { color: colors.textSecondary }]}>Things to bring</Text>
                                    <Text style={[styles.help, { color: colors.textMuted }]}>
                                        People who RSVP "I'm In" pick what they're bringing. Add a number to limit how many can bring an item.
                                    </Text>
                                </View>
                            </View>
                            <View style={{ marginTop: 10 }}>
                                {bringItems.map(item => (
                                    <View key={item.key} style={[styles.itemRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <TextInput
                                            style={[styles.itemInput, { color: colors.textSecondary }]}
                                            placeholder="Item (e.g. Chips)"
                                            placeholderTextColor={colors.placeholder}
                                            maxLength={40}
                                            value={item.name}
                                            onChangeText={v => onChange({ bringItems: bringItems.map(i => i.key === item.key ? { ...i, name: v } : i) })}
                                        />
                                        <TextInput
                                            style={[styles.maxInput, { color: colors.textSecondary, borderLeftColor: colors.border }]}
                                            placeholder="No limit"
                                            placeholderTextColor={colors.placeholder}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            value={item.max}
                                            accessibilityLabel={`How many can bring ${item.name || "this item"}`}
                                            onChangeText={v => onChange({ bringItems: bringItems.map(i => i.key === item.key ? { ...i, max: v.replace(/[^0-9]/g, "") } : i) })}
                                        />
                                        <PressableOpacity
                                            onPress={() => onChange({ bringItems: bringItems.filter(i => i.key !== item.key) })}
                                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                            style={{ marginLeft: 10 }}
                                            accessibilityLabel={`Remove ${item.name || "item"}`}
                                        >
                                            <Feather name="trash-2" size={16} color={colors.textFaint} />
                                        </PressableOpacity>
                                    </View>
                                ))}
                                {itemsError && <Text style={[styles.error, { color: colors.danger }]}>{itemsError}</Text>}
                                {bringItems.length < MAX_ITEMS && (
                                    <PressableOpacity
                                        onPress={() => onChange({ bringItems: [...bringItems, { key: newBringItemKey(), name: "", max: "" }] })}
                                        style={styles.addBtn}
                                    >
                                        <Feather name="plus-circle" size={16} color={colors.brand} />
                                        <Text style={[styles.addBtnText, { color: colors.brand }]}>Add item to bring</Text>
                                    </PressableOpacity>
                                )}
                            </View>

                            {/* Rides */}
                            <View style={[styles.featureRow, styles.divider, { borderTopColor: colors.border, alignItems: "center" }]}>
                                <View style={[styles.featureIcon, { backgroundColor: pc.chipBg }]}>
                                    <Feather name="truck" size={15} color={pc.accent} />
                                </View>
                                <View style={{ flex: 1, paddingRight: 12 }}>
                                    <Text style={[styles.featureTitle, { color: colors.textSecondary }]}>Coordinate rides</Text>
                                    <Text style={[styles.help, { color: colors.textMuted }]}>Ask who's driving (and how many seats) and who needs a ride.</Text>
                                </View>
                                <ToggleSwitch activeColor={pc.accent} value={ridesEnabled} onValueChange={v => onChange({ ridesEnabled: v })} accessibilityLabel="Coordinate rides" />
                            </View>

                            {/* Settings on their own screens */}
                            {links.map(l => {
                                const row = (
                                    <View style={[styles.featureRow, styles.divider, { borderTopColor: colors.border, alignItems: "center" }, !l.onPress && { opacity: 0.6 }]}>
                                        <View style={[styles.featureIcon, { backgroundColor: pc.chipBg }]}>
                                            <Feather name={l.icon} size={15} color={pc.accent} />
                                        </View>
                                        <View style={{ flex: 1, paddingRight: 12 }}>
                                            <Text style={[styles.featureTitle, { color: colors.textSecondary }]}>{l.title}</Text>
                                            <Text style={[styles.help, { color: colors.textMuted }]}>{l.subtitle}</Text>
                                        </View>
                                        {l.onPress && <Feather name="chevron-right" size={20} color={colors.textFaint} />}
                                    </View>
                                );
                                return l.onPress
                                    ? <PressableOpacity key={l.key} onPress={l.onPress} activeOpacity={0.7} accessibilityLabel={l.title}>{row}</PressableOpacity>
                                    : <View key={l.key}>{row}</View>;
                            })}
                        </>
                    )}
                </View>
            )}
            </View>
        </View>
    );
}

const CARD_RADIUS = 20;
const EDGE_WIDTH = 3;

const styles = StyleSheet.create({
    cardEdge: { borderRadius: CARD_RADIUS, padding: EDGE_WIDTH, marginBottom: 18, overflow: "hidden", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
    card: { borderRadius: CARD_RADIUS - EDGE_WIDTH, padding: 18 - EDGE_WIDTH + 1 },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    iconChip: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    title: { fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
    subtitle: { fontSize: 12, fontWeight: "600", marginTop: 1 },
    upsell: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 6 },
    upsellTitle: { fontSize: 14, fontWeight: "800" },
    featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
    divider: { borderTopWidth: 1, marginTop: 4 },
    featureIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
    featureTitle: { fontSize: 15, fontWeight: "700" },
    help: { fontSize: 12, lineHeight: 17, marginTop: 2 },
    itemRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 },
    itemInput: { flex: 1, fontSize: 15 },
    maxInput: { width: 74, fontSize: 15, textAlign: "center", borderLeftWidth: 1 },
    addBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, alignSelf: "flex-start" },
    addBtnText: { fontWeight: "700", fontSize: 14 },
    error: { fontSize: 12, fontWeight: "600", marginTop: 2, marginBottom: 6, marginLeft: 2 },
});

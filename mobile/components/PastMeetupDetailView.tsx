import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { PastMeetupDetail, PastPerson } from '@/utils/api';
import { getUserDisplayName } from '@/utils/groupDisplay';

interface Props {
    detail: PastMeetupDetail;
    onOpenTournament: (tournamentId: string) => void;
}

const FORMAT_LABEL: Record<string, string> = {
    none: 'Teams', roundRobin: 'Round robin', single: 'Single elimination', double: 'Double elimination',
};

const nameOf = (p: PastPerson) => (p.former ? 'Former member' : getUserDisplayName(p));

// Read-only look back at one finished meetup: where, who, the tournament, who brought what, the cars.
// Sections with nothing recorded are left out.
export const PastMeetupDetailView = ({ detail, onOpenTournament }: Props) => {
    const colors = useThemeColors();
    const guestsOf = new Map(detail.guestsBy.map((g) => [g.userId, g.count]));
    const date = new Date(detail.date);
    const cars = detail.cars ?? [];
    const needsRide = detail.needsRide ?? [];
    const items = detail.items ?? [];

    const card = [styles.card, { backgroundColor: colors.surface }];
    const sectionTitle = (text: string) => (
        <Text style={[styles.sectionTitle, { color: colors.textFaint }]}>{text}</Text>
    );

    const peopleSection = (label: string, list: PastPerson[], color: string) => list.length > 0 && (
        <View style={styles.peopleBlock}>
            <Text style={[styles.peopleLabel, { color }]}>{`${label} — ${list.length}`}</Text>
            <View style={styles.chips}>
                {list.map((p) => {
                    const guests = guestsOf.get(p._id) ?? 0;
                    return (
                        <View key={p._id} style={[styles.chip, { backgroundColor: colors.backgroundAlt }]}>
                            {p.profilePicture
                                ? <Image source={{ uri: p.profilePicture }} style={styles.avatar} />
                                : <View style={[styles.avatar, styles.avatarEmpty, { backgroundColor: colors.border }]}><Feather name="user" size={12} color={colors.textFaint} /></View>}
                            <Text style={[styles.chipText, { color: p.former ? colors.textFaint : colors.textSecondary }]}>
                                {guests > 0 ? `${nameOf(p)} +${guests}` : nameOf(p)}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );

    return (
        <View>
            {/* What and where */}
            <View style={card}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>{detail.name}</Text>
                <View style={styles.infoRow}>
                    <Feather name="calendar" size={15} color={colors.brand} />
                    <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                        {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        {' · '}
                        {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                </View>
                {detail.location && (
                    <View style={styles.infoRow}>
                        <Feather name="map-pin" size={15} color="#16A34A" />
                        <Text style={[styles.infoText, { color: colors.textSecondary }]}>{detail.location}</Text>
                    </View>
                )}
            </View>

            {/* Who */}
            <View style={card}>
                {sectionTitle('Attendance')}
                {peopleSection('In', detail.in, '#16A34A')}
                {peopleSection('Out', detail.out, colors.danger)}
                {peopleSection('Undecided', detail.undecided, colors.textMuted)}
                {peopleSection('Waitlist', detail.waitlist, '#D97706')}
                {detail.in.length + detail.out.length + detail.undecided.length + detail.waitlist.length === 0 && (
                    <Text style={{ color: colors.textMuted }}>Nobody was invited.</Text>
                )}
            </View>

            {/* Tournament */}
            {detail.tournament && (
                <View style={card}>
                    {sectionTitle('Tournament')}
                    <Text style={[styles.itemName, { color: colors.textPrimary }]}>
                        {FORMAT_LABEL[detail.tournament.format] ?? 'Event'}
                        {detail.tournament.mode === 'teams' ? ' · Teams' : ''}
                    </Text>
                    {detail.tournament.champion
                        ? (
                            <View style={[styles.infoRow, { marginTop: 6 }]}>
                                <Feather name="award" size={16} color="#D97706" />
                                <Text style={[styles.infoText, { color: colors.textPrimary, fontWeight: '800' }]}>{`Champion: ${detail.tournament.champion}`}</Text>
                            </View>
                        )
                        : <Text style={[styles.itemBy, { color: colors.textMuted }]}>Not finished</Text>}
                    <PressableOpacity
                        onPress={() => onOpenTournament(detail.tournament!.id)}
                        style={[styles.button, { backgroundColor: colors.backgroundAlt }]}
                        activeOpacity={0.75}
                    >
                        <Text style={[styles.buttonText, { color: colors.brand }]}>See results</Text>
                        <Feather name="chevron-right" size={16} color={colors.brand} />
                    </PressableOpacity>
                </View>
            )}

            {/* Who brought what */}
            {items.length > 0 && (
                <View style={card}>
                    {sectionTitle('Brought')}
                    {items.map((item, i) => (
                        <View key={`${item.name}-${i}`} style={[styles.itemRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                            <Text style={[styles.itemName, { color: colors.textPrimary }]}>{item.name}</Text>
                            <Text style={[styles.itemBy, { color: colors.textSecondary }]}>{item.by.map(nameOf).join(', ')}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Cars */}
            {(cars.length > 0 || needsRide.length > 0) && (
                <View style={card}>
                    {sectionTitle('Rides')}
                    {cars.map((car, i) => {
                        const riders = car.riders.map(nameOf).join(', ');
                        const guests = car.guests > 0 ? `+${car.guests} guest${car.guests === 1 ? '' : 's'}` : '';
                        const line = [riders, guests].filter(Boolean).join(' · ') || 'No riders';
                        return (
                            <View key={`${car.driver._id}-${i}`} style={[styles.itemRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                                <View style={styles.infoRow}>
                                    <Feather name="truck" size={15} color={colors.brand} />
                                    <Text style={[styles.itemName, { color: colors.textPrimary, marginLeft: 8 }]}>{`${nameOf(car.driver)}'s car`}</Text>
                                    {car.seats > 0 && <Text style={[styles.seats, { color: colors.textFaint }]}>{`${car.seats} seats`}</Text>}
                                </View>
                                <Text style={[styles.itemBy, { color: colors.textSecondary }]}>{line}</Text>
                            </View>
                        );
                    })}
                    {needsRide.length > 0 && (
                        <Text style={[styles.itemBy, { color: colors.textMuted, marginTop: cars.length ? 10 : 0 }]}>
                            {`Needed a ride: ${needsRide.map(nameOf).join(', ')}`}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    card: { padding: 16, borderRadius: 22, borderCurve: 'continuous', marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    title: { fontSize: 22, fontWeight: '900', marginBottom: 10 },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    infoText: { marginLeft: 8, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    sectionTitle: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
    peopleBlock: { marginBottom: 12 },
    peopleLabel: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingLeft: 4, paddingRight: 10, borderRadius: 999 },
    avatar: { width: 22, height: 22, borderRadius: 11, marginRight: 6 },
    avatarEmpty: { alignItems: 'center', justifyContent: 'center' },
    chipText: { fontSize: 13, fontWeight: '700' },
    itemRow: { paddingVertical: 8 },
    itemName: { fontSize: 15, fontWeight: '800' },
    itemBy: { fontSize: 14, fontWeight: '600', marginTop: 2 },
    seats: { marginLeft: 'auto', fontSize: 12, fontWeight: '700' },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 12, paddingVertical: 10, borderRadius: 12 },
    buttonText: { fontSize: 15, fontWeight: '800' },
});

export default PastMeetupDetailView;

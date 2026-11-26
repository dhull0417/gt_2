import React from 'react';
import { Text } from 'react-native';
import { Meetup } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { formatMeetupDate, meetupViewerDayKey } from '@/utils/meetupTime';

export type DayGroup = { key: string; label: string; items: Meetup[] };

// Groups a date-ordered meetup list into per-day buckets so the date shows once, not per card.
// Days are the viewer's: a late meetup in a group further west can land on the viewer's next day.
export const splitByDay = (list: Meetup[]): DayGroup[] => {
    const groups: DayGroup[] = [];
    list.forEach(meetup => {
        const key = meetupViewerDayKey(meetup);
        let group = groups.find(g => g.key === key);
        if (!group) {
            // key is already YYYY-MM-DD; reuse its year instead of recomputing. Show
            // the year only when it's not current, so far-future instances aren't
            // mistaken for near ones.
            const meetupYear = Number(key.slice(0, 4));
            const currentYear = new Date().getFullYear();
            const label = formatMeetupDate(meetup, {
                weekday: 'short', month: 'short', day: 'numeric',
                year: meetupYear !== currentYear ? 'numeric' : undefined,
            });
            group = { key, label, items: [] };
            groups.push(group);
        }
        group.items.push(meetup);
    });
    return groups;
};

export const DayHeader = ({ label }: { label: string }) => {
    const colors = useThemeColors();
    return (
        <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 8, marginTop: 28, marginBottom: 6, textAlign: 'center' }}>
            {label}
        </Text>
    );
};

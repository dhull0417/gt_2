import React from 'react';
import { Text } from 'react-native';
import { Meetup } from '@/utils/api';

export type DayGroup = { key: string; label: string; items: Meetup[] };

// Groups a date-ordered meetup list into per-day buckets so the date shows once, not per card.
export const splitByDay = (list: Meetup[]): DayGroup[] => {
    const groups: DayGroup[] = [];
    list.forEach(meetup => {
        const key = new Date(meetup.date).toLocaleDateString('en-CA', { timeZone: meetup.timezone });
        let group = groups.find(g => g.key === key);
        if (!group) {
            // key is already YYYY-MM-DD; reuse its year instead of recomputing. Show
            // the year only when it's not current, so far-future instances aren't
            // mistaken for near ones.
            const meetupYear = Number(key.slice(0, 4));
            const currentYear = new Date().getFullYear();
            const label = new Date(meetup.date).toLocaleDateString(undefined, {
                weekday: 'short', month: 'short', day: 'numeric',
                year: meetupYear !== currentYear ? 'numeric' : undefined,
                timeZone: meetup.timezone,
            });
            group = { key, label, items: [] };
            groups.push(group);
        }
        group.items.push(meetup);
    });
    return groups;
};

export const DayHeader = ({ label }: { label: string }) => (
    <Text style={{ fontSize: 16, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 8, marginTop: 28, marginBottom: 6, textAlign: 'center' }}>
        {label}
    </Text>
);

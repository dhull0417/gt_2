import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useApiClient, meetupApi, Meetup } from '../utils/api';
import { getSupabaseClient } from '../utils/supabase';
import { groupUpdatesChannel } from '../utils/groupRealtime';

const MEETUPS_QUERY_KEY = ['meetups'];

export const useGetMeetups = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const query = useQuery<Meetup[], Error>({
        queryKey: MEETUPS_QUERY_KEY,
        queryFn: async () => {
            const cached = queryClient.getQueryData<Meetup[]>(MEETUPS_QUERY_KEY);

            // No cache yet — full fetch.
            if (!cached || cached.length === 0) {
                return meetupApi.getMeetups(api);
            }

            // Otherwise fetch only what changed since our newest cached item.
            const since = cached.reduce((latest, m) => (m.updatedAt > latest ? m.updatedAt : latest), '');
            const { changed, validIds } = await meetupApi.getMeetupsSince(api, since);

            const byId = new Map(cached.map((m) => [m._id, m]));
            for (const m of changed) byId.set(m._id, m);

            const validIdSet = new Set(validIds);
            return Array.from(byId.values()).filter((m) => validIdSet.has(m._id));
        },
    });

    // Realtime: subscribe to every group referenced by the meetups we have
    // cached, so an RSVP change, admin override, or moderator/ownership change
    // made on another device invalidates this list immediately instead of
    // waiting on staleTime. A group-only change (e.g. a moderator promotion)
    // doesn't touch the meetup doc's own updatedAt on its own — the backend
    // bumps it for upcoming meetups when that happens (see group.controller.js's
    // touchGroupMeetups) specifically so the delta-sync above picks it up once
    // this fires a refetch.
    const groupIdsKey = Array.from(new Set(
        (query.data ?? []).map((m) => (typeof m.group === 'string' ? m.group : m.group._id))
    )).sort().join(',');

    useEffect(() => {
        const groupIds = groupIdsKey ? groupIdsKey.split(',') : [];
        if (!groupIds.length) return;

        let active = true;
        let supabase: ReturnType<typeof getSupabaseClient> | null = null;
        const channels: RealtimeChannel[] = [];

        const setup = async () => {
            const token = await getTokenRef.current({ template: 'supabase' });
            if (!token || !active) return;
            supabase = getSupabaseClient(token);
            const onUpdate = () => {
                if (active) queryClient.invalidateQueries({ queryKey: MEETUPS_QUERY_KEY });
            };
            for (const groupId of groupIds) {
                const channel = supabase
                    .channel(groupUpdatesChannel(groupId))
                    .on('broadcast', { event: 'updated' }, onUpdate)
                    .on('broadcast', { event: 'meetup-updated' }, onUpdate)
                    .subscribe();
                channels.push(channel);
            }
        };
        setup();

        return () => {
            active = false;
            channels.forEach((c) => supabase?.removeChannel(c));
        };
    }, [groupIdsKey, queryClient]);

    return query;
};

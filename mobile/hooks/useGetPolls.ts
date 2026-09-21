import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useApiClient, pollApi, Poll } from '../utils/api';
import { getSupabaseClient } from '../utils/supabase';
import { groupUpdatesChannel } from '../utils/groupRealtime';

export const useGetPolls = (groupId?: string) => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const query = useQuery<Poll[], Error>({
        queryKey: ['polls', groupId],
        queryFn: () => pollApi.getPolls(api, groupId as string),
        enabled: !!groupId,
    });

    // Someone else voting/creating/cancelling a poll in this group should show
    // up here right away, same as group-updates realtime elsewhere.
    useEffect(() => {
        if (!groupId) return;
        let active = true;
        let supabase: ReturnType<typeof getSupabaseClient> | null = null;
        let channel: RealtimeChannel | null = null;

        const setup = async () => {
            const token = await getTokenRef.current({ template: 'supabase' });
            if (!token || !active) return;
            supabase = getSupabaseClient(token);
            channel = supabase
                .channel(groupUpdatesChannel(groupId))
                .on('broadcast', { event: 'poll-updated' }, () => {
                    if (!active) return;
                    queryClient.invalidateQueries({ queryKey: ['polls', groupId] });
                })
                .subscribe();
        };
        setup();

        return () => {
            active = false;
            if (channel) supabase?.removeChannel(channel);
            supabase = null;
            channel = null;
        };
    }, [groupId, queryClient]);

    return query;
};

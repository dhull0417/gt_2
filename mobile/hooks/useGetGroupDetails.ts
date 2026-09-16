import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useApiClient, groupApi, GroupDetails } from '../utils/api';
import { getSupabaseClient } from '../utils/supabase';
import { groupUpdatesChannel } from '../utils/groupRealtime';

export const useGetGroupDetails = (groupId: string | null) => {
    const api = useApiClient();
    const queryClient = useQueryClient();
    const { getToken } = useAuth();
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const query = useQuery<GroupDetails, Error>({
        queryKey: ['groupDetails', groupId],
        queryFn: () => groupApi.getGroupDetails(api, groupId!),
        enabled: !!groupId, // don't run without a groupId
    });

    // Local changes invalidate this cache directly (see useAddMember etc); this
    // subscribes to a broadcast so other devices' changes refetch immediately too.
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
                .on('broadcast', { event: 'updated' }, () => {
                    if (!active) return;
                    queryClient.invalidateQueries({ queryKey: ['groupDetails', groupId] });
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

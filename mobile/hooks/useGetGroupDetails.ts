import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
        // The query key includes the groupId to ensure each group's data is cached independently.
        queryKey: ['groupDetails', groupId],
        // The query function calls our new API utility function.
        queryFn: () => groupApi.getGroupDetails(api, groupId!),
        // The 'enabled' option is crucial: it prmeetups the query from running if no groupId is provided.
        enabled: !!groupId,
    });

    // This device's cache is only ever invalidated locally when *this* user
    // makes a change (see useAddMember/useRemoveMember/etc). Subscribe to a
    // broadcast so a change made on someone else's device — a new member
    // joining, a moderator promotion — refetches here immediately instead of
    // waiting out the query's staleTime.
    useEffect(() => {
        if (!groupId) return;
        let active = true;
        let supabase: ReturnType<typeof getSupabaseClient> | null = null;

        const setup = async () => {
            const token = await getTokenRef.current({ template: 'supabase' });
            if (!token || !active) return;
            supabase = getSupabaseClient(token);
            supabase
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
            supabase?.removeAllChannels();
            supabase = null;
        };
    }, [groupId, queryClient]);

    return query;
};

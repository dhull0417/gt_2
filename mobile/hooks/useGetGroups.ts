import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, groupApi, Group } from '../utils/api';

const GROUPS_QUERY_KEY = ['groups'];

export const useGetGroups = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useQuery<Group[], Error>({
        queryKey: GROUPS_QUERY_KEY,
        queryFn: async () => {
            const cached = queryClient.getQueryData<Group[]>(GROUPS_QUERY_KEY);

            // No cache yet — full fetch.
            if (!cached || cached.length === 0) {
                return groupApi.getGroups(api);
            }

            // Otherwise fetch only what changed since our newest cached item.
            const since = cached.reduce((latest, g) => (g.updatedAt > latest ? g.updatedAt : latest), '');
            const { changed, validIds } = await groupApi.getGroupsSince(api, since);

            const byId = new Map(cached.map((g) => [g._id, g]));
            for (const g of changed) byId.set(g._id, g);

            const validIdSet = new Set(validIds);
            return Array.from(byId.values()).filter((g) => validIdSet.has(g._id));
        },
    });
};

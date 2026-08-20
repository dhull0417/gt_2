import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiClient, meetupApi, Meetup } from '../utils/api';

const MEETUPS_QUERY_KEY = ['meetups'];

export const useGetMeetups = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useQuery<Meetup[], Error>({
        queryKey: MEETUPS_QUERY_KEY,
        queryFn: async () => {
            const cached = queryClient.getQueryData<Meetup[]>(MEETUPS_QUERY_KEY);

            // No cache yet (first launch, or persisted cache expired/cleared) — full fetch.
            if (!cached || cached.length === 0) {
                return meetupApi.getMeetups(api);
            }

            // Otherwise only ask for what changed since the newest thing we already have.
            const since = cached.reduce((latest, m) => (m.updatedAt > latest ? m.updatedAt : latest), '');
            const { changed, validIds } = await meetupApi.getMeetupsSince(api, since);

            const byId = new Map(cached.map((m) => [m._id, m]));
            for (const m of changed) byId.set(m._id, m);

            const validIdSet = new Set(validIds);
            return Array.from(byId.values()).filter((m) => validIdSet.has(m._id));
        },
    });
};

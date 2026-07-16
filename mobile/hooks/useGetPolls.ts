import { useQuery } from '@tanstack/react-query';
import { useApiClient, pollApi, Poll } from '../utils/api';

export const useGetPolls = (groupId?: string) => {
    const api = useApiClient();

    return useQuery<Poll[], Error>({
        queryKey: ['polls', groupId],
        queryFn: () => pollApi.getPolls(api, groupId as string),
        enabled: !!groupId,
    });
};

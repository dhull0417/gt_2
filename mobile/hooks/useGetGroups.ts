import { useQuery } from '@tanstack/react-query';
import { useApiClient, groupApi, Group } from '../utils/api';

// The 'export' keyword is the crucial part that was likely missing.
export const useGetGroups = () => {
    const api = useApiClient();

    return useQuery<Group[], Error>({
        queryKey: ['groups'],
        queryFn: () => groupApi.getGroups(api),
    });
};


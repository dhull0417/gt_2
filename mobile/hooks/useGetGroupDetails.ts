import { useQuery } from '@tanstack/react-query';
import { useApiClient, groupApi, GroupDetails } from '../utils/api';

export const useGetGroupDetails = (groupId: string | null) => {
    const api = useApiClient();

    return useQuery<GroupDetails, Error>({
        // The query key includes the groupId to ensure each group's data is cached independently.
        queryKey: ['groupDetails', groupId],
        // The query function calls our new API utility function.
        queryFn: () => groupApi.getGroupDetails(api, groupId!),
        // The 'enabled' option is crucial: it prevents the query from running if no groupId is provided.
        enabled: !!groupId, 
    });
};


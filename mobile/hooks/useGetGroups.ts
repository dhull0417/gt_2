import { useQuery } from '@tanstack/react-query';
import { useApiClient, groupApi, Group } from '../utils/api';

export const useGetGroups = () => {
    const api = useApiClient();

    // MODIFIED: The query function is now a direct call to our updated API function.
    // It no longer needs to manually handle the Axios response.
    return useQuery<Group[], Error>({
        queryKey: ['groups'],
        queryFn: () => groupApi.getGroups(api),
    });
};
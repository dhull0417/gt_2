import { useQuery } from '@tanstack/react-query';
import { useApiClient, groupApi } from '../utils/api';
import { AxiosResponse } from 'axios';

// Define the Group type, matching the one in api.ts and the backend model
export interface Group {
    _id: string;
    name: string;
    time: string;
}

export const useGetGroups = () => {
    const api = useApiClient();

    // This function now correctly returns a promise that resolves to Group[]
    const fetchGroups = async (): Promise<Group[]> => {
        // The API call returns a full AxiosResponse object
        const response: AxiosResponse<Group[]> = await groupApi.getGroups(api);
        // We must return the 'data' property, which contains our array of groups
        return response.data;
    }

    // Explicitly tell useQuery the expected types for data and error
    return useQuery<Group[], Error>({
        queryKey: ['groups'],
        queryFn: fetchGroups, // Use our correctly typed fetch function
    });
};

// mobile/hooks/useGetGroups.ts
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

// Define the shape of a single group object we expect from the API
export interface Group {
    _id: string;
    name: string;
    schedule: {
        frequency: 'weekly' | 'monthly';
        day: number;
        time: string;
    };
}

const getGroupsAPI = async (): Promise<Group[]> => {
    const { data } = await axios.get(`${process.env.EXPO_PUBLIC_API_URL}/api/groups`);
    return data;
};

export const useGetGroups = () => {
    return useQuery<Group[], Error>({
        // This queryKey is crucial!
        // It's the same key we invalidate in `useCreateGroup`,
        // which gives us automatic refetching after a new group is created.
        queryKey: ['groups'],
        queryFn: getGroupsAPI,
    });
};
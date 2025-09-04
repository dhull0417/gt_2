import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/utils/api"; 
import { groupApi } from "@/utils/api";

// Define the shape of a single group object for TypeScript
type Group = {
    _id: string;
    name: string;
};

export const useGetGroups = () => {
    const api = useApiClient();

    return useQuery<Group[]>({
        // queryKey is used by Tanstack Query to cache and manage this data
        queryKey: ["groups"],

        // queryFn is the async function that fetches the data
        queryFn: async () => {
            const { data } = await groupApi.getGroups(api);
            return data;
        },
    });
};
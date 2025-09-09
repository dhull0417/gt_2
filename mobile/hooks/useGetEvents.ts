import { useQuery } from '@tanstack/react-query';
import { useApiClient, eventApi, Event } from '../utils/api';

export const useGetEvents = () => {
    const api = useApiClient();

    return useQuery<Event[], Error>({
        queryKey: ['events'],
        queryFn: () => eventApi.getEvents(api),
    });
};

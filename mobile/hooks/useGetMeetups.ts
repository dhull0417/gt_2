import { useQuery } from '@tanstack/react-query';
import { useApiClient, meetupApi, Meetup } from '../utils/api';

export const useGetMeetups = () => {
    const api = useApiClient();

    return useQuery<Meetup[], Error>({
        queryKey: ['meetups'],
        queryFn: () => meetupApi.getMeetups(api),
    });
};

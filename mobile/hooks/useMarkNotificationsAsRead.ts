import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/utils/api';

export const useMarkNotificationsAsRead = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => api.post('/api/notifications/mark-as-read'),
        onSuccess: () => {
            // Optimistically update the query data to mark all as read
            queryClient.setQueryData(['notifications'], (oldData: any[] | undefined) => 
                oldData ? oldData.map(n => ({ ...n, read: true })) : []
            );
        },
    });
};
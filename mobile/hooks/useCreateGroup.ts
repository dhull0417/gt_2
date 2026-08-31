import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, ScheduleInput } from "../utils/api";
import { Alert } from "react-native";

// Matches the full CreateGroupPayload in api.ts
interface CreateGroupVariables {
    name: string;
    image?: string;
    timezone: string;
    members?: string[];
    meetupsToDisplay: number;
    defaultCapacity?: number;
    defaultLocation?: string;
    schedules?: ScheduleInput[];
}

export const useCreateGroup = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (variables: CreateGroupVariables) =>
            groupApi.createGroup(api, variables),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            queryClient.invalidateQueries({ queryKey: ['meetups'] });
            // Navigation is handled by the screen's own onSuccess callback
        },
        onError: (error: any) => {
            const errorMessage = error.response?.data?.error || "Failed to create group.";
            Alert.alert("Error", errorMessage);
        },
    });
};
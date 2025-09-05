import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, CreateGroupPayload } from "@/utils/api";
import { Alert } from "react-native";

console.log("--- EXECUTING THE CORRECT useCreateGroup.ts file ---");

export const useCreateGroup = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (variables: CreateGroupPayload) => {
            if (!variables.name || variables.name.trim().length === 0) {
                throw new Error("Group name cannot be empty.");
            }
            return await groupApi.createGroup(api, variables);
        },
        
        onSuccess: () => {
            console.log("Group created, invalidating queries...");
            Alert.alert("Success", "Group created successfully!");
            queryClient.invalidateQueries({ queryKey: ['groups'] });
        },
        onError: (error) => {
            console.error("Error creating group:", error);
            // The component's onError callback will now handle the user-facing alert.
        },
    });
};
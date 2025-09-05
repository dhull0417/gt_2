import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, CreateGroupPayload } from "../utils/api";
import { Alert } from "react-native";

// No more 'useNavigation' import

export const useCreateGroup = () => {
    // No more 'navigation' variable
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
            // The hook's only jobs on success are logging and invalidating.
            console.log("Group created, invalidating queries...");
            Alert.alert("Success", "Group created successfully!");
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            
            // REMOVED: navigation.goBack() logic
        },
        onError: (error) => {
            console.error("Error creating group:", error);
            // The component's onError will show the "Creation Failed" alert.
            // We don't need a duplicate alert here.
        },
    });
};
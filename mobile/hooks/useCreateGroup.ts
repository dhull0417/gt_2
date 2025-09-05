// mobile/hooks/useCreateGroup.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, groupApi, CreateGroupPayload } from "../utils/api"; // 1. Import the new CreateGroupPayload type
import { Alert } from "react-native";

// The old 'CreateGroupVariables' interface is no longer needed
// as we now use the more detailed 'CreateGroupPayload' from our api utils.

export const useCreateGroup = () => {
    const api = useApiClient();
    const queryClient = useQueryClient();

    return useMutation({
        // 2. The mutation function now expects the full 'CreateGroupPayload' object
        mutationFn: async (variables: CreateGroupPayload) => {
            // Your client-side validation is good practice
            if (!variables.name || variables.name.trim().length === 0) {
                throw new Error("Group name cannot be empty.");
            }
            
            // 3. Pass the entire 'variables' object to the API call.
            // This now includes name, eventStartDate, and the recurrence rule.
            return await groupApi.createGroup(api, variables);
        },
        
        // 4. Your onSuccess and onError logic is already perfect for this flow.
        // It will now run correctly when the backend returns a successful response.
        onSuccess: (response) => {
            console.log("New Group Created:", response.data);            
            // This invalidates the query, causing the GroupScreen to refetch the list.
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            
        },
        onError: (error) => {
            console.error("Error creating group:", error);
            },
    });
};
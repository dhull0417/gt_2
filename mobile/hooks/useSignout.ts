import { useClerk } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";

export const useSignOut = () => {
    const { signOut } = useClerk();
    const queryClient = useQueryClient();

    const handleSignOut = () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            {text: "Cancel", style:"cancel"},
            {
                text: "Logout",
                style: "destructive",
                onPress: async () => {
                    try {
                        await signOut();
                        // Cache keys aren't scoped per-account — clear so a new sign-in
                        // doesn't serve the previous account's stale data.
                        queryClient.clear();
                    } catch (err) {
                        Alert.alert("Error", "Failed to sign out. Please try again.");
                    }
                },
            },
        ]);
    };

    return { handleSignOut };
}

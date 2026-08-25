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
                        // currentUser (and everything else) is cached under keys that
                        // aren't scoped per-account, so without this, signing into a
                        // different account can keep serving the previous account's
                        // cached data until staleTime lapses.
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

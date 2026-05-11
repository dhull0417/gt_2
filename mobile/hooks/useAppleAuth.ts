import { useSignInWithApple } from "@clerk/expo/apple";
import { useState } from "react";
import { Alert } from "react-native";

export const useAppleAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { startAppleAuthenticationFlow } = useSignInWithApple();

    const handleAppleAuth = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const { createdSessionId, setActive } = await startAppleAuthenticationFlow();

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
            }
        } catch (err: any) {
            if (err.code === "ERR_REQUEST_CANCELED") return;
            console.log("Apple sign in error:", JSON.stringify(err, null, 2));
            Alert.alert("Error", "Failed to sign in with Apple. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleAppleAuth };
};

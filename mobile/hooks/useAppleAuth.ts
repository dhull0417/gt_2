import { useSignInWithApple } from "@clerk/expo/apple";
import { useState } from "react";
import { Alert } from "react-native";

export const useAppleAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { startAppleAuthenticationFlow } = useSignInWithApple();

    const debugLog = async (data: object) => {
        try {
            await fetch("https://gt-2-peach.vercel.app/api/debug/log", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        } catch (_e) {}
    };

    const handleAppleAuth = async () => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const result = await startAppleAuthenticationFlow();
            const { createdSessionId, setActive } = result;
            await debugLog({ event: "apple_flow_result", createdSessionId, hasSetActive: !!setActive, resultKeys: Object.keys(result) });
            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
            }
        } catch (err: any) {
            if (err.code === "ERR_REQUEST_CANCELED") return;
            await debugLog({ event: "apple_flow_error", code: err.code, message: err.message, status: err.status, errors: err.errors });
            Alert.alert("Error", "Failed to sign in with Apple. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleAppleAuth };
};

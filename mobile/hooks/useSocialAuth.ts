import { useSSO } from "@clerk/expo";
import { useState } from "react"
import { Alert } from "react-native";
import { useRouter } from "expo-router";


export const useSocialAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const {startSSOFlow}=useSSO();
    const router = useRouter();

    const handleSocialAuth = async(strategy:"oauth_google") => {
        setIsLoading(true)
        try {
            const { createdSessionId, setActive } = await startSSOFlow({ strategy });
            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
            }
        } catch (err) {
            console.log("Error in social auth", err)
            const provider = strategy ==="oauth_google" ? "Google" : "Apple";
            Alert.alert("Error", `Failed to sign in with ${provider}. Please try again.`)
            // On Android, a failure here can happen after the deep-link callback
            // already navigated to /sso-callback (see mobile/app/sso-callback.tsx),
            // which no longer redirects on its own. Route back to sign-in so the
            // user isn't stranded on the loading screen.
            router.replace('/(auth)');
        } finally {
            setIsLoading(false)
        }
    }

    return {isLoading, handleSocialAuth}
}

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
            // On Android this can fail after /sso-callback already navigated away
            // and won't redirect itself — route back so the user isn't stranded.
            router.replace('/(auth)');
        } finally {
            setIsLoading(false)
        }
    }

    return {isLoading, handleSocialAuth}
}

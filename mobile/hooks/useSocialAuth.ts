import { useSSO } from "@clerk/expo";
import { useSignInWithGoogle } from "@clerk/expo/google";
import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { runGoogleSignIn } from "@/utils/googleSignIn";

const ALERT_TITLE = "Google sign-in";
const GENERIC_FAILURE_MESSAGE = "Failed to sign in with Google. Please try again.";

/**
 * Google sign-in for the welcome screen. On Android this uses the native account sheet and only
 * falls back to a browser tab (Chrome first) if the sheet can't run; iPhone uses the browser flow.
 * The decisions live in utils/googleSignIn.ts.
 */
export const useSocialAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { startSSOFlow } = useSSO();
    const { startGoogleAuthenticationFlow } = useSignInWithGoogle();
    const router = useRouter();

    // On Android a failure can come after the browser's deep link already opened /sso-callback,
    // which doesn't redirect on its own, so route back to sign-in so nobody is stranded there.
    const fail = (message: string) => {
        Alert.alert(ALERT_TITLE, message);
        router.replace('/(auth)');
    };

    const handleSocialAuth = async (_strategy: "oauth_google") => {
        setIsLoading(true);
        try {
            const outcome = await runGoogleSignIn({
                platform: Platform.OS,
                startNative: () => startGoogleAuthenticationFlow(),
                // Clerk's type only lists `showInRecents`, but it passes authSessionOptions straight to
                // expo-web-browser's openAuthSessionAsync, which honours `browserPackage` on Android.
                startBrowser: (opts) =>
                    startSSOFlow({ strategy: "oauth_google", ...opts } as Parameters<typeof startSSOFlow>[0]),
                getBrowsers: () => WebBrowser.getCustomTabsSupportingBrowsersAsync(),
                log: (msg) => console.warn(msg),
            });
            if (outcome.kind === "session") {
                await outcome.setActive({ session: outcome.sessionId });
            } else if (outcome.kind === "failed") {
                fail(outcome.message);
            }
            // "cancelled": the person closed the native sheet; stay on sign-in quietly.
        } catch (err) {
            console.warn("Google sign-in failed:", (err as any)?.errors?.[0]?.code ?? (err as any)?.message);
            fail(GENERIC_FAILURE_MESSAGE);
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleSocialAuth };
};

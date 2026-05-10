import { useSignIn, useSignUp } from "@clerk/clerk-expo";
import { useState } from "react";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

export const useAppleAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { signIn, setActive: signInSetActive, isLoaded: signInLoaded } = useSignIn();
    const { signUp, setActive: signUpSetActive, isLoaded: signUpLoaded } = useSignUp();

    const handleAppleAuth = async () => {
        if (!signInLoaded || !signUpLoaded || isLoading) return;
        setIsLoading(true);
        try {
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            if (!credential.identityToken) {
                Alert.alert("Error", "Failed to sign in with Apple. Please try again.");
                return;
            }

            const tokenPayload = JSON.parse(atob(credential.identityToken.split('.')[1]));
            const debugInfo = {
                tokenClaims: {
                    iss: tokenPayload.iss,
                    aud: tokenPayload.aud,
                    sub: tokenPayload.sub,
                    exp: new Date(tokenPayload.exp * 1000).toISOString(),
                },
                hasEmail: !!credential.email,
                hasFullName: !!credential.fullName?.givenName,
            };
            console.log("Apple debug info:", debugInfo);
            fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/debug/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(debugInfo),
            }).catch(() => {});

            const signInResult = await signIn!.create({
                strategy: "oauth_token_apple",
                token: credential.identityToken,
            });

            if (signInResult.createdSessionId) {
                await signInSetActive!({ session: signInResult.createdSessionId });
                return;
            }

            // New user — transfer to sign-up, passing name from Apple (only provided on first sign-in)
            if (signInResult.firstFactorVerification.status === "transferable") {
                const signUpResult = await signUp!.create({
                    transfer: true,
                    ...(credential.fullName?.givenName && { firstName: credential.fullName.givenName }),
                    ...(credential.fullName?.familyName && { lastName: credential.fullName.familyName }),
                });

                if (signUpResult.createdSessionId) {
                    await signUpSetActive!({ session: signUpResult.createdSessionId });
                }
            }
        } catch (err: any) {
            if (err.code === "ERR_REQUEST_CANCELED") return;
            console.log("Apple sign in error:", JSON.stringify(err, null, 2));
            fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/debug/log`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clerkError: err }),
            }).catch(() => {});
            Alert.alert("Error", "Failed to sign in with Apple. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleAppleAuth };
};

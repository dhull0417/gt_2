// Legacy (non-signal) Clerk API — matches the shape Clerk's own native Apple hook
// uses internally (signIn.create/firstFactorVerification.status, signUp.create({transfer}), setActive).
// Imported via require(), not `import`, so Metro resolves the CommonJS build (matching
// how @clerk/expo's own precompiled ClerkProvider requires it) instead of the separate
// ESM build — the two builds each create their own React context instance, so an `import`
// here would read from a context @clerk/expo's <ClerkProvider> never writes to and throw
// "useSignIn can only be used within the <ClerkProvider />" even though it clearly is.
const { useSignIn, useSignUp } = require("@clerk/react/legacy") as typeof import("@clerk/react/legacy");
import { useState } from "react";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useApiClient, userApi } from "@/utils/api";

// Not using Clerk's own useSignInWithApple hook here: it requests Apple's FULL_NAME
// scope but then discards credential.fullName, only forwarding the identityToken.
// Apple hands us the user's name exactly once — on the very first authorization for
// this Apple ID + app — and never again after that, so if we don't capture and save
// it right here, it's gone for good and the user is stuck with a blank name.
export const useAppleAuth = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { signIn, setActive, isLoaded: isSignInLoaded } = useSignIn();
    const { signUp, isLoaded: isSignUpLoaded } = useSignUp();
    const api = useApiClient();

    const handleAppleAuth = async () => {
        if (isLoading || !isSignInLoaded || !isSignUpLoaded) return;
        setIsLoading(true);
        try {
            const isAvailable = await AppleAuthentication.isAvailableAsync();
            if (!isAvailable) {
                Alert.alert("Apple Sign In Failed", "Apple Authentication is not available on this device.");
                return;
            }

            const nonce = Crypto.randomUUID();
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
                nonce,
            });

            const { identityToken, fullName } = credential;
            if (!identityToken) {
                Alert.alert("Apple Sign In Failed", "No identity token received from Apple.");
                return;
            }
            const firstName = fullName?.givenName ?? undefined;
            const lastName = fullName?.familyName ?? undefined;

            await signIn!.create({ strategy: "oauth_token_apple", token: identityToken });

            const userNeedsToBeCreated = signIn!.firstFactorVerification.status === "transferable";
            let createdSessionId: string | null;
            if (userNeedsToBeCreated) {
                await signUp!.create({ transfer: true });
                createdSessionId = signUp!.createdSessionId;
            } else {
                createdSessionId = signIn!.createdSessionId;
            }

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
            }

            // Only a brand-new account has a name worth saving. Send it straight to our
            // backend (idempotent — later syncUser calls from useUserSync just no-op)
            // rather than waiting on Clerk's client-side user object, which can lag.
            if (userNeedsToBeCreated && (firstName || lastName)) {
                try {
                    await userApi.syncUser(api, { firstName, lastName });
                } catch (syncErr) {
                    console.log("Apple name sync failed:", syncErr);
                }
            }
        } catch (err: any) {
            if (err.code === "ERR_REQUEST_CANCELED") return;
            console.log("Apple sign in error:", JSON.stringify(err, null, 2));
            const message = err?.errors?.[0]?.longMessage
                ?? err?.errors?.[0]?.message
                ?? err?.message
                ?? JSON.stringify(err);
            Alert.alert("Apple Sign In Failed", message);
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleAppleAuth };
};

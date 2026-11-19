// Legacy (non-signal) Clerk API — matches the shape Clerk's own native Apple hook
// uses internally (signIn.create/firstFactorVerification.status, signUp.create({transfer}), setActive).
// Imported via require(), not `import`, so Metro resolves the CommonJS build (matching
// how @clerk/expo's own precompiled ClerkProvider requires it) instead of the separate
// ESM build — the two builds each create their own React context instance, so an `import`
// here would read from a context @clerk/expo's <ClerkProvider> never writes to and throw
// "useSignIn can only be used within the <ClerkProvider />" even though it clearly is.
const { useSignIn, useSignUp } = require("@clerk/react/legacy") as typeof import("@clerk/react/legacy");
import { useState } from "react";
import { useClerk } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useApiClient, userApi } from "@/utils/api";
import { clerkErrorMessage } from "@/utils/clerkErrors";
import { savePendingAppleName, clearPendingAppleName } from "@/utils/pendingAppleName";

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
    const clerk = useClerk();
    const queryClient = useQueryClient();

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
            const firstName = fullName?.givenName?.trim() || undefined;
            const lastName = fullName?.familyName?.trim() || undefined;
            const hasName = !!(firstName || lastName);

            // Keep a copy on the device before anything can fail. useUserSync resends it on
            // later launches until the server has it, then it's cleared.
            if (hasName) {
                await savePendingAppleName({ appleUserId: credential.user, firstName: firstName ?? "", lastName: lastName ?? "" });
            }

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

            // Apple only sends a name on the first authorization. Send it straight to our
            // backend: syncUser fills it in even if useUserSync already created the user as
            // "New Member" a moment earlier. The device copy is cleared only once this succeeds.
            if (hasName) {
                // Best effort: give Clerk the name too. This can fail if name fields are off
                // in the Clerk dashboard; our own database is what the app reads.
                try {
                    await clerk.user?.update({ firstName: firstName ?? "", lastName: lastName ?? "" });
                } catch (clerkErr) {
                    console.warn("Apple name → Clerk failed:", (clerkErr as any)?.errors?.[0]?.code ?? (clerkErr as any)?.message);
                }
                try {
                    await userApi.syncUser(api, { firstName, lastName });
                    await clearPendingAppleName();
                    queryClient.invalidateQueries({ queryKey: ["currentUser"] });
                } catch (syncErr) {
                    console.warn("Apple name sync failed:", (syncErr as any)?.message);
                }
            }
        } catch (err: any) {
            if (err.code === "ERR_REQUEST_CANCELED") return;
            console.warn("Apple sign-in failed:", err?.errors?.[0]?.code ?? err?.code ?? err?.message);
            Alert.alert("Apple Sign In Failed", clerkErrorMessage(err, "Something went wrong. Please try again."));
        } finally {
            setIsLoading(false);
        }
    };

    return { isLoading, handleAppleAuth };
};

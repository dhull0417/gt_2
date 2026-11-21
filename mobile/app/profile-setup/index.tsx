import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import type { TextInputInstance } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { User, useApiClient, userApi } from '@/utils/api';
import { openPendingInvite } from '@/utils/pendingInvite';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { haptic } from '@/utils/haptics';
import { unregisterPushToken } from '@/hooks/usePushNotifications';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { fontSize } from '@/constants/theme';

const ProfileSetupScreen = () => {
    const { user: clerkUser } = useUser();
    const { signOut } = useAuth();
    const router = useRouter();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const colors = useThemeColors();
    // Our own currentUser record is the source of truth for the name. Clerk only gets a
    // best-effort copy of an Apple name (see useAppleAuth.ts), so prefer currentUser; it's
    // kept warm in this same query cache by app/_layout.tsx's routing.
    const { data: currentUser } = useQuery<User, Error>({
        queryKey: ['currentUser'],
        queryFn: () => userApi.getCurrentUser(api),
    });
    const [firstName, setFirstName] = useState(currentUser?.firstName ?? clerkUser?.firstName ?? '');
    const [lastName, setLastName] = useState(currentUser?.lastName ?? clerkUser?.lastName ?? '');
    const [zipCode, setZipCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const lastNameRef = useRef<TextInputInstance>(null);
    const zipRef = useRef<TextInputInstance>(null);

    // Names can arrive after first render (the user record loads late); fill them in
    // unless the person has already started typing.
    useEffect(() => {
        if (!firstName && (currentUser?.firstName || clerkUser?.firstName)) setFirstName(currentUser?.firstName ?? clerkUser?.firstName ?? '');
        if (!lastName && (currentUser?.lastName || clerkUser?.lastName)) setLastName(currentUser?.lastName ?? clerkUser?.lastName ?? '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.firstName, currentUser?.lastName, clerkUser?.firstName, clerkUser?.lastName]);

    const isAppleUser = clerkUser?.externalAccounts?.some(a => (a.provider as string).includes('apple')) ?? false;
    // Apple only hands us a name on the account's very first authorization ever, so a
    // returning/re-created Apple account can land here with nothing on file — prompt
    // for it directly instead of leaving them stuck showing as "New Member".
    const needsName = isAppleUser && !currentUser?.firstName?.trim() && !currentUser?.lastName?.trim();

    // Plain awaited calls, not useMutation() — its onSuccess doesn't reliably fire
    // once router.replace unmounts this screen (see useUpdateProfile's history).
    const handleSaveProfile = async () => {
        if (!isAppleUser && (!firstName.trim() || !lastName.trim())) {
            Alert.alert('Missing Information', 'Please fill out all fields.');
            return;
        }
        // Required: the app won't continue without it (see the routing check in app/_layout.tsx),
        // and it is what lets us show places near you first when you pick a location.
        if (zipCode.trim().length !== 5) {
            haptic.error();
            Alert.alert('Zip Code Needed', 'Please enter your 5-digit zip code.');
            return;
        }
        // Apple users: omit firstName/lastName so syncUser populates them from Apple's token instead,
        // unless we prompted for it ourselves because Apple never gave us one.
        const appleNameOverride = needsName && (firstName.trim() || lastName.trim())
            ? { firstName: firstName.trim(), lastName: lastName.trim() }
            : {};
        const profileData = isAppleUser
            ? { ...appleNameOverride, zipCode: zipCode.trim() }
            : { firstName: firstName.trim(), lastName: lastName.trim(), zipCode: zipCode.trim() };

        setIsSaving(true);
        try {
            // Ensure the Mongo user exists first — idempotent, returns existing user if present
            await userApi.syncUser(api, { firstName: clerkUser?.firstName ?? '', lastName: clerkUser?.lastName ?? '' });
            const { data } = await userApi.updateProfile(api, profileData);
            if (data?.user) {
                queryClient.setQueryData(['currentUser'], data.user);
            } else {
                queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            }

            if (!(await openPendingInvite(router, 'replace'))) {
                router.replace('/(tabs)');
            }
        } catch (error: any) {
            haptic.error();
            const errorMessage = error.response?.data?.error || 'Failed to update profile.';
            Alert.alert('Error', errorMessage);
        } finally {
            setIsSaving(false);
        }
    };

    const nameFields = (
        <>
            <TextField
                label="First name"
                placeholder="Sam"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                autoComplete="given-name"
                textContentType="givenName"
                returnKeyType="next"
                onSubmitEditing={() => lastNameRef.current?.focus()}
                containerStyle={styles.field}
            />
            <TextField
                ref={lastNameRef}
                label="Last name"
                placeholder="Lee"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                autoComplete="family-name"
                textContentType="familyName"
                returnKeyType="next"
                onSubmitEditing={() => zipRef.current?.focus()}
                containerStyle={styles.field}
            />
        </>
    );

    return (
        <AuthScreen
            title="Set up your profile"
            subtitle="Tell your groups who you are. This only takes a moment."
            footer={
                // Signed in with the wrong account? Without this there's no way out of setup.
                <View style={styles.footerRow}>
                    <Text style={[styles.footerText, { color: colors.textMuted }]}>Not you? </Text>
                    <PressableOpacity
                        hitSlop={8}
                        disabled={isSaving}
                        accessibilityLabel="Sign out"
                        onPress={async () => { await unregisterPushToken(api); queryClient.clear(); signOut(); }}
                    >
                        <Text style={[styles.footerText, { color: colors.brand, fontWeight: '700' }]}>Sign out</Text>
                    </PressableOpacity>
                </View>
            }
        >
            {!isAppleUser && nameFields}

            {needsName && (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                        <Feather name="user" size={18} color={colors.brand} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Add your name</Text>
                        <Text style={[styles.optional, { color: colors.textFaint }]}>Optional</Text>
                    </View>
                    <Text style={[styles.cardBody, { color: colors.textMuted }]}>So your friends know who you are.</Text>
                    {nameFields}
                </View>
            )}

            <TextField
                ref={zipRef}
                label="Zip code"
                placeholder="84060"
                autoComplete="postal-code"
                textContentType="postalCode"
                returnKeyType="done"
                onSubmitEditing={handleSaveProfile}
                value={zipCode}
                onChangeText={(text) => setZipCode(text.replace(/\D/g, '').slice(0, 5))}
                keyboardType="number-pad"
                maxLength={5}
                helperText="Helps us show places near you first when you pick a meetup location. We never share it."
                containerStyle={styles.fieldLast}
            />

            {isAppleUser && !needsName && (
                <Text style={[styles.note, { color: colors.textMuted }]}>
                    You can change your name anytime in Profile › Update Account Info.
                </Text>
            )}

            <Button title="Save & continue" size="lg" onPress={handleSaveProfile} loading={isSaving} />
        </AuthScreen>
    );
};

const styles = StyleSheet.create({
    field: { marginBottom: 14 },
    fieldLast: { marginBottom: 24 },
    card: { borderRadius: 20, borderWidth: 1, padding: 16, paddingBottom: 4, marginBottom: 18 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    cardTitle: { fontSize: fontSize.lg, fontWeight: '800', flex: 1 },
    optional: { fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardBody: { fontSize: fontSize.md, marginBottom: 14 },
    note: { fontSize: fontSize.sm, textAlign: 'center', marginBottom: 18 },
    footerRow: { flexDirection: 'row', justifyContent: 'center' },
    footerText: { fontSize: fontSize.base },
});

export default ProfileSetupScreen;

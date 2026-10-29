import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useApiClient, userApi } from '@/utils/api';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { VerificationCodeForm } from '@/components/auth/VerificationCodeForm';
import { clerkErrorMessage } from '@/utils/clerkErrors';
import { toast } from '@/contexts/ToastContext';
import { haptic } from '@/utils/haptics';

/** Changing your phone number is verified with a text-message code before anything is saved. */
const UpdatePhoneScreen = () => {
    const { user } = useUser();
    const api = useApiClient();
    const router = useRouter();
    const queryClient = useQueryClient();
    const colors = useThemeColors();
    const [digits, setDigits] = useState('');
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const e164 = `+1${digits}`; // the app is US-only for now

    const sendCode = async () => {
        if (!user) return;
        if (digits.length !== 10) {
            Alert.alert('Phone number', 'Enter a 10-digit US phone number.');
            return;
        }
        setIsLoading(true);
        try {
            // Clear leftovers from an earlier unfinished attempt, or Clerk rejects re-adding as "taken".
            const stale = user.phoneNumbers.filter((p) => p.id !== user.primaryPhoneNumberId && p.verification?.status !== 'verified');
            await Promise.all(stale.map((p) => p.destroy()));
            const phone = await user.createPhoneNumber({ phoneNumber: e164 });
            await phone.prepareVerification();
            setPendingId(phone.id);
        } catch (err: any) {
            haptic.error();
            Alert.alert('Error', clerkErrorMessage(err, "We couldn't send a code to that number."));
        } finally {
            setIsLoading(false);
        }
    };

    const verify = async (code: string) => {
        if (!user || !pendingId) return;
        setIsLoading(true);
        try {
            const phone = user.phoneNumbers.find((p) => p.id === pendingId);
            if (!phone) throw new Error('Could not find the phone number to verify.');
            await phone.attemptVerification({ code });
            // Save to our own record first so the two stores can't disagree, then make it primary in Clerk.
            await userApi.updateProfile(api, { phoneNumber: phone.phoneNumber });
            await user.update({ primaryPhoneNumberId: phone.id } as any);
            queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            toast.success('Phone number updated.');
            router.back();
        } catch (err: any) {
            haptic.error();
            Alert.alert("That didn't work", err?.response?.data?.error || clerkErrorMessage(err, 'Check the code and try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    const resend = async () => {
        const phone = user?.phoneNumbers.find((p) => p.id === pendingId);
        try { await phone?.prepareVerification(); } catch (err: any) { Alert.alert('Error', clerkErrorMessage(err, "We couldn't resend the code.")); }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6" keyboardShouldPersistTaps="handled">
                    {pendingId ? (
                        <VerificationCodeForm
                            destination={e164}
                            onSubmit={verify}
                            onResend={resend}
                            isLoading={isLoading}
                            onBack={() => setPendingId(null)}
                        />
                    ) : (
                        <>
                            <View style={{ marginBottom: 20 }}>
                                <Text style={[styles.label, { color: colors.textFaint }]}>Current Phone</Text>
                                <View style={[styles.readOnlyBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
                                    <Feather name="phone" size={16} color={colors.textFaint} />
                                    <Text style={[styles.readOnlyText, { color: colors.textMuted }]}>{user?.primaryPhoneNumber?.phoneNumber || 'None yet'}</Text>
                                </View>
                            </View>
                            <Text style={[styles.label, { color: colors.textFaint }]}>New Phone Number</Text>
                            <TextInput
                                value={digits}
                                onChangeText={(t) => setDigits(t.replace(/\D/g, '').slice(0, 10))}
                                placeholder="10-digit US number"
                                placeholderTextColor={colors.placeholder}
                                keyboardType="phone-pad"
                                autoComplete="tel"
                                textContentType="telephoneNumber"
                                returnKeyType="done"
                                onSubmitEditing={sendCode}
                                style={[styles.input, { backgroundColor: colors.backgroundAlt, borderColor: colors.border, color: colors.textSecondary }]}
                            />
                            <Text style={{ color: colors.textFaint, fontSize: 13, marginTop: 10, marginBottom: 28 }}>
                                We'll text a code to confirm it's yours. Friends who have you in their contacts can then find you in the app.
                            </Text>
                            <PressableOpacity onPress={sendCode} disabled={isLoading} haptic="press" style={[styles.saveBtn, { backgroundColor: colors.brand }]} activeOpacity={0.85}>
                                {isLoading ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Send Code</Text>}
                            </PressableOpacity>
                        </>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    input: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 16 },
    readOnlyBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 56 },
    readOnlyText: { fontSize: 15, fontWeight: '600' },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default UpdatePhoneScreen;

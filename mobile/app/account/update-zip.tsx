import { View, Text, TextInput, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { User, useApiClient, userApi } from '@/utils/api';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { toast } from '@/contexts/ToastContext';

const UpdateZipScreen = () => {
    const api = useApiClient();
    const router = useRouter();
    const colors = useThemeColors();
    const { data: currentUser } = useQuery<User, Error>({ queryKey: ['currentUser'], queryFn: () => userApi.getCurrentUser(api) });
    const [zip, setZip] = useState('');
    const queryClient = useQueryClient();
    const [isPending, setIsPending] = useState(false);

    useEffect(() => { if (currentUser?.zipCode) setZip(currentUser.zipCode); }, [currentUser?.zipCode]);

    const handleSave = async () => {
        if (zip.length !== 5) {
            toast.error('Enter your 5-digit zip code.');
            return;
        }
        setIsPending(true);
        try {
            const { data } = await userApi.updateProfile(api, { zipCode: zip });
            if (data?.user) queryClient.setQueryData(['currentUser'], data.user);
            else queryClient.invalidateQueries({ queryKey: ['currentUser'] });
            toast.success('Zip code updated.');
            router.back();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || "Couldn't save your zip code. Try again.");
        } finally {
            setIsPending(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6" keyboardShouldPersistTaps="handled">
                    <Text style={[styles.label, { color: colors.textFaint }]}>Zip Code</Text>
                    <TextInput
                        value={zip}
                        onChangeText={(t) => setZip(t.replace(/\D/g, '').slice(0, 5))}
                        placeholder="12345"
                        placeholderTextColor={colors.placeholder}
                        keyboardType="number-pad"
                        autoComplete="postal-code"
                        textContentType="postalCode"
                        returnKeyType="done"
                        onSubmitEditing={handleSave}
                        style={[styles.input, { backgroundColor: colors.backgroundAlt, borderColor: colors.border, color: colors.textSecondary }]}
                    />
                    <Text style={{ color: colors.textFaint, fontSize: 13, marginTop: 10, marginBottom: 28 }}>
                        Used to show places near you first when you pick a meetup location.
                    </Text>
                    <PressableOpacity onPress={handleSave} disabled={isPending} haptic="press" style={[styles.saveBtn, { backgroundColor: colors.brand }]} activeOpacity={0.85}>
                        {isPending ? <ActivityIndicator color="white" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                    </PressableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    input: { width: '100%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, height: 56, fontSize: 16 },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default UpdateZipScreen;

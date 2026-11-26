import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useChangePassword } from '@/hooks/useChangePassword';
import { useThemeColors } from '@/contexts/AppearanceContext';

const ChangePasswordScreen = () => {
    const { user, isLoaded } = useUser();
    const router = useRouter();
    const colors = useThemeColors();

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [isCurrentVisible, setCurrentVisible] = useState(false);
    const [isNewVisible, setNewVisible] = useState(false);
    const [isConfirmVisible, setConfirmVisible] = useState(false);

    const { mutate: changePassword, isPending } = useChangePassword();

    useEffect(() => {
        if (isLoaded && user && !user.passwordEnabled) {
            router.replace('/account');
        }
    }, [isLoaded, user]);

    const handleSave = () => {
        if (!currentPassword || !newPassword) {
            Alert.alert('Error', 'Please fill out all fields.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert('Error', 'New passwords do not match.');
            return;
        }
        changePassword({ currentPassword, newPassword });
    };

    if (!isLoaded || !user?.passwordEnabled) {
        return (
            <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black items-center justify-center">
                <ActivityIndicator color={colors.brand} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View style={{ marginBottom: 20 }}>
                        <Text style={[styles.label, { color: colors.textFaint }]}>Current Password</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
                            <TextInput
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="Enter your current password"
                                placeholderTextColor={colors.placeholder}
                                secureTextEntry={!isCurrentVisible}
                                autoComplete="current-password"
                                autoCapitalize="none"
                                returnKeyType="next"
                                textContentType="oneTimeCode"
                                style={[styles.textInput, { color: colors.textSecondary }]}
                            />
                            <PressableOpacity accessibilityLabel={isCurrentVisible ? 'Hide password' : 'Show password'} onPress={() => setCurrentVisible(!isCurrentVisible)}>
                                <Feather name={isCurrentVisible ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
                            </PressableOpacity>
                        </View>
                    </View>
                    <View style={{ marginBottom: 20 }}>
                        <Text style={[styles.label, { color: colors.textFaint }]}>New Password</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
                            <TextInput
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="Enter your new password"
                                placeholderTextColor={colors.placeholder}
                                secureTextEntry={!isNewVisible}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                returnKeyType="next"
                                textContentType="oneTimeCode"
                                style={[styles.textInput, { color: colors.textSecondary }]}
                            />
                            <PressableOpacity accessibilityLabel={isNewVisible ? 'Hide password' : 'Show password'} onPress={() => setNewVisible(!isNewVisible)}>
                                <Feather name={isNewVisible ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
                            </PressableOpacity>
                        </View>
                    </View>
                    <View style={{ marginBottom: 28 }}>
                        <Text style={[styles.label, { color: colors.textFaint }]}>Confirm New Password</Text>
                        <View style={[styles.inputContainer, { backgroundColor: colors.backgroundAlt, borderColor: colors.border }]}>
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm your new password"
                                placeholderTextColor={colors.placeholder}
                                secureTextEntry={!isConfirmVisible}
                                autoComplete="new-password"
                                autoCapitalize="none"
                                returnKeyType="done"
                                textContentType="oneTimeCode"
                                style={[styles.textInput, { color: colors.textSecondary }]}
                            />
                            <PressableOpacity accessibilityLabel={isConfirmVisible ? 'Hide password' : 'Show password'} onPress={() => setConfirmVisible(!isConfirmVisible)}>
                                <Feather name={isConfirmVisible ? 'eye-off' : 'eye'} size={20} color={colors.textFaint} />
                            </PressableOpacity>
                        </View>
                    </View>
                    <PressableOpacity
                        onPress={handleSave}
                        disabled={isPending}
                        style={[styles.saveBtn, { backgroundColor: colors.brand }]}
                        activeOpacity={0.85}
                    >
                        {isPending
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.saveBtnText}>Save New Password</Text>}
                    </PressableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    label: { fontSize: 12, fontWeight: '800', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
    inputContainer: { width: '100%', flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 16, height: 56, gap: 10 },
    textInput: { flex: 1, fontSize: 16, color: '#1F2937' },
    saveBtn: { width: '100%', height: 54, borderRadius: 16, backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center' },
    saveBtnText: { color: 'white', fontSize: 16, fontWeight: '800' },
});

export default ChangePasswordScreen;

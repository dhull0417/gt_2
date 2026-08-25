import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useChangePassword } from '@/hooks/useChangePassword';

const ChangePasswordScreen = () => {
    const { user, isLoaded } = useUser();
    const router = useRouter();

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
            <SafeAreaView className="flex-1 bg-gray-100 items-center justify-center">
                <ActivityIndicator color="#4A90E2" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                className="flex-1"
            >
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="p-6">
                    <View style={{ marginBottom: 20 }}>
                        <Text style={styles.label}>Current Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                value={currentPassword}
                                onChangeText={setCurrentPassword}
                                placeholder="Enter your current password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isCurrentVisible}
                                textContentType="oneTimeCode"
                                style={styles.textInput}
                            />
                            <TouchableOpacity onPress={() => setCurrentVisible(!isCurrentVisible)}>
                                <Feather name={isCurrentVisible ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={{ marginBottom: 20 }}>
                        <Text style={styles.label}>New Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder="Enter your new password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isNewVisible}
                                textContentType="oneTimeCode"
                                style={styles.textInput}
                            />
                            <TouchableOpacity onPress={() => setNewVisible(!isNewVisible)}>
                                <Feather name={isNewVisible ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <View style={{ marginBottom: 28 }}>
                        <Text style={styles.label}>Confirm New Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="Confirm your new password"
                                placeholderTextColor="#9CA3AF"
                                secureTextEntry={!isConfirmVisible}
                                textContentType="oneTimeCode"
                                style={styles.textInput}
                            />
                            <TouchableOpacity onPress={() => setConfirmVisible(!isConfirmVisible)}>
                                <Feather name={isConfirmVisible ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={isPending}
                        style={styles.saveBtn}
                        activeOpacity={0.85}
                    >
                        {isPending
                            ? <ActivityIndicator color="white" />
                            : <Text style={styles.saveBtnText}>Save New Password</Text>}
                    </TouchableOpacity>
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

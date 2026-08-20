import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/expo';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useApiClient, userApi } from '@/utils/api';

const DeleteAccountScreen = () => {
    const { signOut } = useAuth();
    const api = useApiClient();
    const queryClient = useQueryClient();
    const [deleteLoading, setDeleteLoading] = useState(false);

    const handleDeleteAccount = () => {
        Alert.alert(
            'Final Confirmation',
            'This will permanently delete your account from GroupThat. There is no way to recover it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Yes, Delete My Account',
                    style: 'destructive',
                    onPress: async () => {
                        setDeleteLoading(true);
                        try {
                            await userApi.deleteAccount(api);
                            queryClient.clear();
                            await signOut();
                        } catch {
                            Alert.alert('Error', 'Something went wrong while deleting your account. Please try again.');
                        } finally {
                            setDeleteLoading(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <View className="p-6">
                <View style={styles.warningBox}>
                    <Feather name="alert-triangle" size={22} color="#EF4444" style={{ marginBottom: 10 }} />
                    <Text style={styles.warningTitle}>Delete Account</Text>
                    <Text style={styles.warningText}>
                        Are you sure you want to permanently delete your account? This cannot be undone.
                        {'\n\n'}
                        All your data, messages, and any groups you own will be deleted or transferred.
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={handleDeleteAccount}
                    disabled={deleteLoading}
                    style={styles.deleteBtn}
                    activeOpacity={0.7}
                >
                    {deleteLoading
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <Text style={styles.deleteText}>Delete Account</Text>}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    warningBox: {
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        borderRadius: 16,
        padding: 18,
        marginBottom: 20,
    },
    warningTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#B91C1C',
        marginBottom: 6,
    },
    warningText: {
        fontSize: 14,
        color: '#7F1D1D',
        lineHeight: 20,
    },
    deleteBtn: {
        height: 50,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#EF4444',
        backgroundColor: '#FEF2F2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    deleteText: {
        color: '#EF4444',
        fontWeight: '900',
        textTransform: 'uppercase',
        fontSize: 12,
    },
});

export default DeleteAccountScreen;

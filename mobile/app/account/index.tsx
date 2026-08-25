import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';

const ALL_SETTINGS = [
    { id: 'name', label: 'Update Name', href: '/account/update-name' as const, icon: 'user' as const, color: '#4A90E2' },
    { id: 'email', label: 'Update Email', href: '/account/update-email' as const, icon: 'mail' as const, color: '#7C3AED' },
    { id: 'password', label: 'Change Password', href: '/account/change-password' as const, icon: 'lock' as const, color: '#F59E0B' },
    { id: 'delete', label: 'Delete Account', href: '/account/delete-account' as const, icon: 'trash-2' as const, color: '#EF4444' },
];

const AccountSettingsScreen = () => {
    const router = useRouter();
    const { user } = useUser();

    const settings = ALL_SETTINGS.filter((item) => item.id !== 'password' || user?.passwordEnabled);

    return (
        <SafeAreaView className="flex-1 bg-gray-100">
            <View className="mt-6 mx-4">
                {settings.map((item, index) => (
                    <TouchableOpacity
                        key={item.id}
                        onPress={() => router.push(item.href)}
                        activeOpacity={0.7}
                        style={[styles.card, styles.row, index < settings.length - 1 && { marginBottom: 12 }]}
                    >
                        <View style={[styles.rowIcon, { backgroundColor: item.color + '18' }]}>
                            <Feather name={item.icon} size={18} color={item.color} />
                        </View>
                        <Text style={styles.rowLabel}>{item.label}</Text>
                        <Feather name="chevron-right" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                ))}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: 'white',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    rowIcon: {
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    rowLabel: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
});

export default AccountSettingsScreen;

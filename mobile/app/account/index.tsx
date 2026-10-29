import { View, Text, StyleSheet } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import { Feather } from '@expo/vector-icons';
import { useThemeColors } from '@/contexts/AppearanceContext';

const AccountSettingsScreen = () => {
    const router = useRouter();
    const { user } = useUser();
    const colors = useThemeColors();

    const ALL_SETTINGS = [
        { id: 'name', label: 'Update Name', href: '/account/update-name' as const, icon: 'user' as const, color: colors.brand },
        { id: 'email', label: 'Update Email', href: '/account/update-email' as const, icon: 'mail' as const, color: '#7C3AED' },
        { id: 'phone', label: 'Update Phone Number', href: '/account/update-phone' as const, icon: 'phone' as const, color: '#0EA5E9' },
        { id: 'zip', label: 'Update Zip Code', href: '/account/update-zip' as const, icon: 'map-pin' as const, color: colors.accentTeal },
        { id: 'password', label: 'Change Password', href: '/account/change-password' as const, icon: 'lock' as const, color: colors.warning },
        { id: 'delete', label: 'Delete Account', href: '/account/delete-account' as const, icon: 'trash-2' as const, color: colors.danger },
    ];

    const settings = ALL_SETTINGS.filter((item) => item.id !== 'password' || user?.passwordEnabled);

    return (
        <SafeAreaView className="flex-1 bg-gray-100 dark:bg-black">
            <View className="mt-6 mx-4">
                {settings.map((item, index) => (
                    <PressableOpacity
                        key={item.id}
                        onPress={() => router.push(item.href)}
                        activeOpacity={0.7}
                        style={[
                            styles.card,
                            styles.row,
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            index < settings.length - 1 && { marginBottom: 12 },
                        ]}
                    >
                        <View style={[styles.rowIcon, { backgroundColor: item.color + '18' }]}>
                            <Feather name={item.icon} size={18} color={item.color} />
                        </View>
                        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                        <Feather name="chevron-right" size={18} color={colors.textFaint} />
                    </PressableOpacity>
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

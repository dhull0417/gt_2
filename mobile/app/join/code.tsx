import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { normalizeInviteCode, parseInviteUrl } from '@/utils/inviteLink';

/** Type a 6-character invite code (or paste a whole invite link) to open that invite. */
export default function InviteCodeScreen() {
    const colors = useThemeColors();
    const router = useRouter();
    const [value, setValue] = useState('');
    const [error, setError] = useState('');

    const submit = () => {
        const link = parseInviteUrl(value);
        if (link) {
            router.replace({ pathname: '/join/[token]', params: { token: link.token, s: 'link', ...(link.meetupId ? { m: link.meetupId } : {}) } });
            return;
        }
        const code = normalizeInviteCode(value);
        if (!code) { setError('Invite codes are 6 letters and numbers, like K7P2QX.'); return; }
        router.replace({ pathname: '/join/[token]', params: { token: code, s: 'code' } });
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
            <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <PressableOpacity style={styles.back} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel="Back">
                    <Feather name="chevron-left" size={28} color={colors.textPrimary} />
                </PressableOpacity>
                <View style={styles.content}>
                    <Feather name="key" size={40} color={colors.brand} style={{ marginBottom: 16 }} />
                    <Text style={[styles.title, { color: colors.textPrimary }]}>Enter invite code</Text>
                    <Text style={[styles.subtitle, { color: colors.textMuted }]}>Ask the person who invited you for the code on their invite screen, or paste the invite link.</Text>
                    <TextInput
                        value={value}
                        onChangeText={(t) => { setValue(t); setError(''); }}
                        placeholder="K7P2QX"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        autoFocus
                        returnKeyType="go"
                        onSubmitEditing={submit}
                        style={[styles.input, { color: colors.textPrimary, borderColor: error ? colors.danger : colors.borderStrong, backgroundColor: colors.surface }]}
                        maxLength={200}
                        accessibilityLabel="Invite code"
                    />
                    {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
                    <PressableOpacity
                        style={[styles.button, { backgroundColor: colors.brand }, !value.trim() && { opacity: 0.5 }]}
                        onPress={submit}
                        disabled={!value.trim()}
                    >
                        <Text style={styles.buttonText}>Continue</Text>
                    </PressableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    flex: { flex: 1 },
    back: { padding: 12, alignSelf: 'flex-start' },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
    title: { fontSize: 24, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
    input: { width: '100%', borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, fontSize: 22, letterSpacing: 4, textAlign: 'center', fontWeight: '600' },
    error: { marginTop: 8, fontSize: 13, textAlign: 'center' },
    button: { marginTop: 20, width: '100%', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

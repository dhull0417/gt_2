import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { VerificationCodeForm } from '@/components/auth/VerificationCodeForm';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { useCodeAuth } from '@/hooks/useCodeAuth';
import { toE164US } from '@/utils/phone';
import { fontSize } from '@/constants/theme';

/** Sign in or sign up with a text message code. New numbers get an account automatically. */
export default function PhoneLogin() {
  const router = useRouter();
  const colors = useThemeColors();
  const code = useCodeAuth('phone');
  const [phone, setPhone] = useState('');
  const normalized = toE164US(phone);
  const canSend = normalized.replace(/\D/g, '').length >= 10;

  if (code.step === 'code') {
    return (
      <AuthScreen title="Check your messages" onBack={code.back}>
        <VerificationCodeForm
          destination={code.destination}
          onSubmit={code.verify}
          onResend={code.resend}
          isLoading={code.isLoading}
          onBack={code.back}
          showHeading={false}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Continue with phone"
      subtitle="We'll text you a code to sign in or create your account."
      onBack={() => router.back()}
    >
      <TextField
        autoFocus
        value={phone}
        onChangeText={setPhone}
        placeholder="(801) 555-1234"
        accessibilityLabel="Phone number"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="go"
        onSubmitEditing={() => canSend && code.start(normalized)}
        helperText="US numbers don't need +1. For other countries, start with + and the country code."
        containerStyle={styles.field}
      />
      <Button
        title="Send code"
        size="lg"
        onPress={() => code.start(normalized)}
        loading={code.isLoading}
        disabled={!canSend}
        icon={<Feather name="message-circle" size={18} color="#FFFFFF" />}
      />
      <Text style={[styles.hint, { color: colors.textMuted }]}>Message and data rates may apply.</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
  hint: { fontSize: fontSize.sm, textAlign: 'center', marginTop: 18 },
});

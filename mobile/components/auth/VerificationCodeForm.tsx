import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useThemeColors } from '@/contexts/AppearanceContext';

interface Props {
  /** "We emailed a code to a***@gmail.com" - say where it went. */
  destination: string;
  onSubmit: (code: string) => Promise<void> | void;
  onResend?: () => Promise<void> | void;
  isLoading?: boolean;
  /** Hide "Resend" (e.g. authenticator app codes). */
  hideResend?: boolean;
  onBack?: () => void;
}

const RESEND_COOLDOWN_S = 30;

/** The one code-entry step used by sign-up and sign-in, with guidance, autofill and a resend timer. */
export function VerificationCodeForm({ destination, onSubmit, onResend, isLoading, hideResend, onBack }: Props) {
  const colors = useThemeColors();
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = () => { if (code.trim().length >= 4 && !isLoading) onSubmit(code.trim()); };

  return (
    <View>
      <Text className="text-3xl font-black text-gray-900 dark:text-white mb-2">Check your {destination.includes('@') ? 'email' : 'messages'}</Text>
      <Text className="text-base text-gray-600 dark:text-gray-400 mb-6">
        We sent a verification code to {destination}. It can take a minute to arrive - check your spam folder if you don't see it.
      </Text>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="Verification code"
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={submit}
        className="w-full bg-gray-100 dark:bg-gray-800 p-4 border border-gray-300 dark:border-gray-700 rounded-lg text-base mb-4"
        style={{ height: 52, paddingVertical: 0, textAlignVertical: 'center', lineHeight: undefined, color: colors.textPrimary, letterSpacing: 4 }}
      />
      <PressableOpacity
        onPress={submit}
        disabled={isLoading || code.trim().length < 4}
        haptic="press"
        className="w-full py-4 rounded-lg items-center shadow"
        style={{ backgroundColor: colors.brand, opacity: code.trim().length < 4 ? 0.6 : 1 }}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white text-lg font-bold">Verify</Text>}
      </PressableOpacity>
      <View className="flex-row justify-between mt-5">
        {onBack ? (
          <PressableOpacity onPress={onBack}>
            <Text className="text-base text-gray-600 dark:text-gray-400">Back</Text>
          </PressableOpacity>
        ) : <View />}
        {!hideResend && onResend && (
          <PressableOpacity
            disabled={cooldown > 0}
            onPress={async () => { await onResend(); setCooldown(RESEND_COOLDOWN_S); }}
          >
            <Text className="text-base font-bold" style={{ color: cooldown > 0 ? colors.textFaint : colors.brand }}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Text>
          </PressableOpacity>
        )}
      </View>
    </View>
  );
}

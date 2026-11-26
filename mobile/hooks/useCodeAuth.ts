import { useState } from 'react';
import { Alert } from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { useAndroidBack } from '@/hooks/useAndroidBack';
import { haptic } from '@/utils/haptics';
import { startCode, verifyCode, resendCode, type CodeKind, type CodeMode } from '@/utils/codeAuth';

/**
 * Screen state for signing in or up with a one-time code (see utils/codeAuth.ts).
 * `start` sends the code and moves to the code step; `verify` finishes, after which the root
 * layout's routing takes over (profile setup for new accounts, the app for returning ones).
 */
export function useCodeAuth(kind: CodeKind) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [mode, setMode] = useState<CodeMode>('signIn');
  const [destination, setDestination] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const clerk = { signIn, signUp };

  const back = () => setStep('enter');
  useAndroidBack(step === 'code', back);

  const showError = (message: string) => {
    haptic.error();
    Alert.alert("Couldn't continue", message);
  };

  const start = async (identifier: string) => {
    if (isLoading) return false;
    setIsLoading(true);
    try {
      const r = await startCode(kind, identifier, clerk);
      if (!r.ok) { showError(r.message); return false; }
      setMode(r.mode ?? 'signIn');
      setDestination(identifier);
      setStep('code');
      return true;
    } finally {
      setIsLoading(false);
    }
  };

  const verify = async (code: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const r = await verifyCode(kind, mode, code, clerk);
      if (!r.ok) showError(r.message);
      else haptic.success();
    } finally {
      setIsLoading(false);
    }
  };

  const resend = async () => {
    const r = await resendCode(kind, mode, clerk);
    if (!r.ok) showError(r.message);
    return r.ok;
  };

  return { step, mode, destination, isLoading, start, verify, resend, back };
}

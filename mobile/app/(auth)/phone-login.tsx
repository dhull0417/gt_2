import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSignIn, useSignUp } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function PhoneLogin() {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Handle "Send Code"
  const onSendCodePress = async () => {
    setIsLoading(true);
    try {
      const { error } = await signIn.create({ identifier: phoneNumber });

      if (!error) {
        const phoneFactor = signIn.supportedFirstFactors?.find(
          (f: any) => f.strategy === 'phone_code'
        ) as any;

        if (phoneFactor) {
          await signIn.phoneCode.sendCode();
          setIsSigningUp(false);
          setPendingVerification(true);
        } else {
          Alert.alert("Error", "This account does not support phone login.");
        }
      } else if ((error as any).errors?.[0]?.code === 'form_identifier_not_found') {
        const { error: signUpError } = await signUp.create({ phoneNumber });
        if (signUpError) {
          Alert.alert("Error", (signUpError as any).errors?.[0]?.longMessage || signUpError.longMessage || signUpError.message || "Failed to create account.");
          return;
        }
        const { error: sendError } = await signUp.verifications.sendPhoneCode();
        if (sendError) {
          Alert.alert("Error", (sendError as any).errors?.[0]?.longMessage || sendError.longMessage || sendError.message || "Failed to send code.");
          return;
        }
        setIsSigningUp(true);
        setPendingVerification(true);
      } else {
        Alert.alert("Error", (error as any).errors?.[0]?.longMessage || error.longMessage || error.message || "Something went wrong.");
      }
    } catch (err: any) {
      Alert.alert("Error", err.errors?.[0]?.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle "Verify Code"
  const onVerifyPress = async () => {
    setIsLoading(true);
    try {
      if (isSigningUp) {
        const { error } = await signUp.verifications.verifyPhoneCode({ code });
        if (error) {
          Alert.alert("Error", error.longMessage || error.message || "Invalid code.");
          return;
        }
        if (signUp.status === 'complete') {
          await signUp.finalize();
        } else {
          Alert.alert("Error", `Verification failed. Status: ${signUp.status}`);
        }
      } else {
        const { error } = await signIn.phoneCode.verifyCode({ code });
        if (error) {
          Alert.alert("Error", error.longMessage || error.message || "Invalid code.");
          return;
        }
        if (signIn.status === 'complete') {
          await signIn.finalize();
        } else {
          Alert.alert("Error", `Verification failed. Status: ${signIn.status}`);
        }
      }
    } catch (err: any) {
      Alert.alert("Error", err.errors?.[0]?.message || "Invalid code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"} 
      style={styles.container}
    >
      {/* Header / Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#FF7A6E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Phone Login</Text>
      </View>

      <View style={styles.content}>
        {!pendingVerification ? (
          // === STEP 1: ENTER PHONE ===
          <>
            <Text style={styles.label}>Enter your phone number</Text>
            <Text style={styles.subLabel}>We'll send you a code to verify your account.</Text>
            
            <TextInput
              autoFocus
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="+1 555 555 5555"
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor="#9CA3AF"
            />

            <TouchableOpacity 
              onPress={onSendCodePress} 
              style={[styles.button, isLoading && styles.buttonDisabled]}
              disabled={isLoading}
            >
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Send Code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          // === STEP 2: ENTER CODE ===
          <>
            <Text style={styles.label}>Enter verification code</Text>
            <Text style={styles.subLabel}>Sent to {phoneNumber}</Text>
            
            <TextInput
              autoFocus
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              style={styles.input}
              placeholderTextColor="#9CA3AF"
              maxLength={6}
            />

            <TouchableOpacity 
              onPress={onVerifyPress} 
              style={[styles.button, isLoading && styles.buttonDisabled]}
              disabled={isLoading}
            >
               {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Verify & Continue</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setPendingVerification(false)} style={styles.secondaryButton}>
               <Text style={styles.secondaryButtonText}>Change Phone Number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    padding: 24,
    flex: 1,
  },
  label: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111827',
  },
  subLabel: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  button: {
    backgroundColor: '#4A90E2',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#4A90E2',
    fontWeight: '500',
  },
});
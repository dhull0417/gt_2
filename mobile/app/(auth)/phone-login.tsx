import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

export default function PhoneLogin() {
  const { signIn, setActive: setSignInActive, isLoaded: isSignInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: isSignUpLoaded } = useSignUp();
  const router = useRouter();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Handle "Send Code"
  const onSendCodePress = async () => {
    if (!isSignInLoaded || !isSignUpLoaded) return;
    setIsLoading(true);

    try {
      // A. Try to start the Sign In process
      const { supportedFirstFactors } = await signIn.create({
        identifier: phoneNumber,
      });

      // If we get here, the user exists! 
      // Look for the phone code strategy. Cast as any to avoid TS issues.
      const phoneFactor = supportedFirstFactors?.find((factor: any) => 
        factor.strategy === 'phone_code'
      ) as any;

      if (phoneFactor) {
        // Send the code for Login
        await signIn.prepareFirstFactor({
          strategy: 'phone_code',
          phoneNumberId: phoneFactor.phoneNumberId,
        });
        setIsSigningUp(false);
        setPendingVerification(true);
      } else {
        Alert.alert("Error", "This account does not support phone login.");
      }

    } catch (err: any) {
      // B. If error is "user not found", start Sign Up process
      // Error code: form_identifier_not_found means user doesn't exist yet
      if (err.errors?.[0]?.code === "form_identifier_not_found") {
        try {
          await signUp.create({ phoneNumber });
          await signUp.prepareVerification({ strategy: "phone_code" });
          
          setIsSigningUp(true);
          setPendingVerification(true);
        } catch (signUpErr: any) {
            Alert.alert("Error", signUpErr.errors?.[0]?.message || "Failed to create account.");
        }
      } else {
        // Real error (e.g., invalid phone format)
        Alert.alert("Error", err.errors?.[0]?.message || "Something went wrong.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle "Verify Code"
  const onVerifyPress = async () => {
    if (!isSignInLoaded || !isSignUpLoaded) return;
    setIsLoading(true);

    try {
      if (isSigningUp) {
        console.log("Verifying Sign Up...");
        const completeSignUp = await signUp.attemptVerification({ 
          strategy: 'phone_code',
          code 
        });

        // 👇 LOGGING THE RESULT HERE
        console.log("Sign Up Result Status:", completeSignUp.status);
        if (completeSignUp.status !== 'complete') {
            console.log("Incomplete Details:", JSON.stringify(completeSignUp, null, 2));
        }

        if (completeSignUp.status === 'complete') {
          await setSignUpActive({ session: completeSignUp.createdSessionId });
        } else {
          Alert.alert("Error", `Verification failed. Status: ${completeSignUp.status}`);
        }
      } else {
        console.log("Verifying Sign In...");
        const completeSignIn = await signIn.attemptFirstFactor({
          strategy: 'phone_code',
          code,
        });

        // 👇 LOGGING THE RESULT HERE
        console.log("Sign In Result Status:", completeSignIn.status);
        
        if (completeSignIn.status === 'complete') {
          await setSignInActive({ session: completeSignIn.createdSessionId });
        } else {
          Alert.alert("Error", `Verification failed. Status: ${completeSignIn.status}`);
        }
      }
    } catch (err: any) {
      console.error("Verification Catch Error:", JSON.stringify(err, null, 2));
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
          <Feather name="arrow-left" size={24} color="#000" />
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
    backgroundColor: '#4F46E5',
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
    color: '#4F46E5',
    fontWeight: '500',
  },
});
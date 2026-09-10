import { useSocialAuth } from "@/hooks/useSocialAuth";
import { useAppleAuth } from "@/hooks/useAppleAuth";
import { useRef, useState } from "react";
import { Animated, Dimensions, Text, Image, View, TouchableOpacity, ActivityIndicator, StyleSheet, Linking } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from "expo-apple-authentication";

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function Index() {
  const { handleSocialAuth, isLoading } = useSocialAuth();
  const { handleAppleAuth, isLoading: appleIsLoading } = useAppleAuth();
  const isAnyLoading = isLoading || appleIsLoading;
  const router = useRouter();
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

  const toggleOtherOptions = () => {
    const toValue = showOtherOptions ? 0 : 1;
    Animated.timing(slideAnim, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setShowOtherOptions(!showOtherOptions);
  };

  const primaryTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -SCREEN_WIDTH],
  });
  const otherTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_WIDTH, 0],
  });

  const handleOpenPrivacyPolicy = () => {
    Linking.openURL("https://groupthatapp.com/privacy-policy/").catch((err) =>
      console.error("Couldn't load page", err)
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
          <View style={styles.logoContainer}>
            <View style={styles.logoBox}>
              <Image
                source={require("../../assets/images/splash-icon.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          <View style={{ height: '50%' }} />

          <View style={[styles.buttonGroup, { marginTop: 118 }]}>
            <View style={styles.slideStage}>
              {/* Primary: Google + Email */}
              <Animated.View
                style={[styles.slidePane, { transform: [{ translateX: primaryTranslateX }] }]}
                pointerEvents={showOtherOptions ? 'none' : 'auto'}
              >
                <TouchableOpacity
                  style={[styles.button, styles.shadow]}
                  onPress={() => handleSocialAuth("oauth_google")}
                  disabled={isAnyLoading}
                >
                  {isLoading ? <ActivityIndicator size="small" color="#000" /> : (
                    <View style={styles.buttonContent}>
                      <Image source={require("../../assets/images/google-logo.png")} style={styles.iconImage} resizeMode="contain" />
                      <Text style={styles.buttonText}>Continue with Google</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.shadow]}
                  onPress={() => router.push('/(auth)/sign-in')}
                >
                  <View style={styles.buttonContent}>
                      <Feather name="mail" size={24} color="#000" style={{ marginRight: 12 }} />
                      <Text style={styles.buttonText}>Continue with Email</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>

              {/* Other: Apple + Phone */}
              <Animated.View
                style={[styles.slidePane, styles.slidePaneOverlay, { transform: [{ translateX: otherTranslateX }] }]}
                pointerEvents={showOtherOptions ? 'auto' : 'none'}
              >
                {appleIsLoading ? (
                  <View style={[styles.appleButton, styles.shadow]}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={9999}
                    style={[styles.appleButton, styles.shadow]}
                    onPress={handleAppleAuth}
                  />
                )}

                <TouchableOpacity
                  style={[styles.button, styles.shadow]}
                  onPress={() => router.push('/(auth)/phone-login')}
                  disabled={isAnyLoading}
                >
                  <View style={styles.buttonContent}>
                    <Feather name="phone" size={22} color="#000" style={{ marginRight: 12 }} />
                    <Text style={styles.buttonText}>Continue with Phone</Text>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Other Options Toggle */}
            <TouchableOpacity
              style={styles.otherOptionsToggle}
              onPress={toggleOtherOptions}
            >
              <Text style={styles.otherOptionsText}>Other Options</Text>
              <Feather name={showOtherOptions ? 'chevron-up' : 'chevron-down'} size={16} color="#6B7280" style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }} />

          <View>
            <Text style={styles.footerText}>
              By signing up, you agree to our
              <Text style={styles.linkText} onPress={handleOpenPrivacyPolicy}> Privacy Policy</Text>
            </Text>
          </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  logoContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -85 }],
  },
  logoBox: {
    width: 320,
    height: 196,
    position: 'relative',
  },
  logoImage: {
    width: 320,
    height: 196,
  },
  buttonGroup: {
    gap: 8,
  },
  slideStage: {
    height: 104,
    overflow: 'hidden',
  },
  slidePane: {
    width: '100%',
    gap: 8,
  },
  slidePaneOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  appleButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#000000',
    borderRadius: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 9999,
    height: 48,
    paddingHorizontal: 24,
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  buttonText: {
    color: '#000000',
    fontWeight: '600',
    fontSize: 18,
  },
  otherOptionsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  otherOptionsText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
  footerText: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 24,
    paddingHorizontal: 8,
  },
  linkText: {
    color: '#3B82F6',
  },
});
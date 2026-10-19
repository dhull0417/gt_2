import { useSocialAuth } from "@/hooks/useSocialAuth";
import { useAppleAuth } from "@/hooks/useAppleAuth";
import { useState } from "react";
import Reanimated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Dimensions, Text, Image, View, ActivityIndicator, StyleSheet, Linking } from "react-native";
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from "expo-apple-authentication";
import { useThemeColors } from '@/contexts/AppearanceContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function Index() {
  const { handleSocialAuth, isLoading } = useSocialAuth();
  const { handleAppleAuth, isLoading: appleIsLoading } = useAppleAuth();
  const isAnyLoading = isLoading || appleIsLoading;
  const router = useRouter();
  const colors = useThemeColors();
  const [showOtherOptions, setShowOtherOptions] = useState(false);
  const slide = useSharedValue(0);

  const toggleOtherOptions = () => {
    slide.value = withTiming(showOtherOptions ? 0 : 1, { duration: 300 });
    setShowOtherOptions(!showOtherOptions);
  };

  const primaryPaneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(slide.value, [0, 1], [0, -SCREEN_WIDTH]) }],
  }));
  const otherPaneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(slide.value, [0, 1], [SCREEN_WIDTH, 0]) }],
  }));

  const handleOpenPrivacyPolicy = () => {
    Linking.openURL("https://groupthatapp.com/privacy-policy/").catch((err) =>
      console.error("Couldn't load page", err)
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
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
              <Reanimated.View
                style={[styles.slidePane, primaryPaneStyle]}
                pointerEvents={showOtherOptions ? 'none' : 'auto'}
              >
                <PressableOpacity
                  style={[styles.button, styles.shadow, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
                  onPress={() => handleSocialAuth("oauth_google")}
                  disabled={isAnyLoading}
                >
                  {isLoading ? <ActivityIndicator size="small" color={colors.textPrimary} /> : (
                    <View style={styles.buttonContent}>
                      <Image source={require("../../assets/images/google-logo.png")} style={styles.iconImage} resizeMode="contain" />
                      <Text style={[styles.buttonText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3} numberOfLines={1} ellipsizeMode="tail">Continue with Google</Text>
                    </View>
                  )}
                </PressableOpacity>

                <PressableOpacity
                  style={[styles.button, styles.shadow, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
                  onPress={() => router.push('/(auth)/sign-in')}
                >
                  <View style={styles.buttonContent}>
                      <Feather name="mail" size={24} color={colors.textPrimary} style={{ marginRight: 12 }} />
                      <Text style={[styles.buttonText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3} numberOfLines={1} ellipsizeMode="tail">Continue with Email</Text>
                  </View>
                </PressableOpacity>
              </Reanimated.View>

              {/* Other: Apple + Phone */}
              <Reanimated.View
                style={[styles.slidePane, styles.slidePaneOverlay, otherPaneStyle]}
                pointerEvents={showOtherOptions ? 'auto' : 'none'}
              >
                {appleIsLoading ? (
                  // Mirrors AppleAuthenticationButton's mandated black BLACK style below — kept black in both themes
                  <View style={[styles.appleButton, styles.shadow]}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : (
                  // Apple's own branded button — buttonStyle is Apple's brand guideline, left as-is regardless of theme
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={9999}
                    style={[styles.appleButton, styles.shadow]}
                    onPress={handleAppleAuth}
                  />
                )}

                <PressableOpacity
                  style={[styles.button, styles.shadow, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}
                  onPress={() => router.push('/(auth)/phone-login')}
                  disabled={isAnyLoading}
                >
                  <View style={styles.buttonContent}>
                    <Feather name="phone" size={22} color={colors.textPrimary} style={{ marginRight: 12 }} />
                    <Text style={[styles.buttonText, { color: colors.textPrimary }]} maxFontSizeMultiplier={1.3} numberOfLines={1} ellipsizeMode="tail">Continue with Phone</Text>
                  </View>
                </PressableOpacity>
              </Reanimated.View>
            </View>

            {/* Other Options Toggle */}
            <PressableOpacity
              style={styles.otherOptionsToggle}
              onPress={toggleOtherOptions}
            >
              <Text style={[styles.otherOptionsText, { color: colors.textMuted }]}>Other Options</Text>
              <Feather name={showOtherOptions ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
            </PressableOpacity>
          </View>

          <View style={{ flex: 1 }} />

          <View>
            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              By signing up, you agree to our
              <Text style={[styles.linkText, { color: colors.brand }]} onPress={handleOpenPrivacyPolicy}> Privacy Policy</Text>
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
    flexShrink: 1,
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

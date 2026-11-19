import { useSocialAuth } from "@/hooks/useSocialAuth";
import { useAppleAuth } from "@/hooks/useAppleAuth";
import React, { useCallback, useState } from "react";
import { peekPendingInvite } from "@/utils/pendingInvite";
import { authButtonOrder, type AuthOption } from "@/utils/authOptions";
import { Text, Image, View, ActivityIndicator, StyleSheet, Linking, Platform } from "react-native";
import Animated, { FadeInDown, FadeOutUp, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { Button } from '@/components/ui/Button';
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from "expo-apple-authentication";
import { useThemeColors } from '@/contexts/AppearanceContext';
import { fontSize } from '@/constants/theme';

const BUTTON_HEIGHT = 52;
const BUTTON_RADIUS = 14;
// One duration for every part of the "More options" reveal so it moves as one.
const REVEAL_MS = 260;
const revealLayout = LinearTransition.duration(REVEAL_MS);

export default function Index() {
  const { handleSocialAuth, isLoading: googleIsLoading } = useSocialAuth();
  const { handleAppleAuth, isLoading: appleIsLoading } = useAppleAuth();
  const isAnyLoading = googleIsLoading || appleIsLoading;
  const router = useRouter();
  const colors = useThemeColors();
  const order = authButtonOrder(Platform.OS);
  const [showMore, setShowMore] = useState(false);
  // An invite picked up from a link or from the install is waiting for sign-in.
  const [hasInvite, setHasInvite] = useState(false);
  useFocusEffect(useCallback(() => {
    const check = () => peekPendingInvite().then((p) => setHasInvite(!!p)).catch(() => {});
    check();
    // A fresh install's invite (install referrer / clipboard) can arrive a moment after launch.
    const t = setTimeout(check, 1500);
    return () => clearTimeout(t);
  }, []));

  // The chevron turns as the extra options slide in. Phone drops down and fades in while the
  // logo, the buttons and the toggle glide to their new spots, all on the same timing.
  const chevron = useSharedValue(0);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.value * 180}deg` }] }));
  const toggleMore = () => {
    const next = !showMore;
    chevron.value = withTiming(next ? 1 : 0, { duration: REVEAL_MS });
    setShowMore(next);
  };

  const handleOpenPrivacyPolicy = () => {
    Linking.openURL("https://groupthatapp.com/privacy-policy/").catch((err) =>
      console.error("Couldn't load page", err)
    );
  };

  const optionStyle = [styles.option, { backgroundColor: colors.surface }];

  const renderOption = (option: AuthOption) => {
    switch (option) {
      case 'apple':
        // Apple's own branded button (its style is Apple's guideline, kept black in both themes).
        return appleIsLoading ? (
          <View key="apple" style={[styles.appleButton, styles.shadow]}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : (
          <View key="apple" pointerEvents={isAnyLoading ? 'none' : 'auto'} style={{ opacity: isAnyLoading ? 0.5 : 1 }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={BUTTON_RADIUS}
              style={[styles.appleButton, styles.shadow]}
              onPress={handleAppleAuth}
            />
          </View>
        );
      case 'google':
        return (
          <Button
            key="google"
            title="Continue with Google"
            variant="outline"
            size="lg"
            onPress={() => handleSocialAuth("oauth_google")}
            loading={googleIsLoading}
            disabled={isAnyLoading && !googleIsLoading}
            icon={<Image source={require("../../assets/images/google-logo.png")} style={styles.googleLogo} resizeMode="contain" />}
            style={optionStyle}
          />
        );
      case 'email':
        return (
          <Button
            key="email"
            title="Continue with Email"
            variant="outline"
            size="lg"
            onPress={() => router.push('/(auth)/email')}
            disabled={isAnyLoading}
            icon={<Feather name="mail" size={20} color={colors.textPrimary} />}
            style={optionStyle}
          />
        );
      case 'phone':
        return (
          <Button
            key="phone"
            title="Continue with Phone"
            variant="outline"
            size="lg"
            onPress={() => router.push('/(auth)/phone-login')}
            disabled={isAnyLoading}
            icon={<Feather name="phone" size={20} color={colors.textPrimary} />}
            style={optionStyle}
          />
        );
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.container}>
        {/* The transition sits on the logo itself, not its container: the container's frame
            animating doesn't move the logo, which would re-center instantly and jump. */}
        <View style={styles.logoArea}>
          <Animated.Image
            layout={revealLayout}
            source={require("../../assets/images/splash-icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>

        <Animated.View style={styles.buttonGroup} layout={revealLayout}>
          {order.primary.map(renderOption)}
          {showMore ? order.more.map((option) => (
            <Animated.View
              key={option}
              entering={FadeInDown.duration(REVEAL_MS)}
              exiting={FadeOutUp.duration(REVEAL_MS * 0.7)}
            >
              {renderOption(option)}
            </Animated.View>
          )) : null}
          {order.more.length > 0 ? (
            <Animated.View layout={revealLayout}>
              <PressableOpacity style={styles.moreToggle} onPress={toggleMore} accessibilityRole="button" accessibilityState={{ expanded: showMore }}>
                <Text style={[styles.moreText, { color: colors.textMuted }]}>{showMore ? 'Fewer options' : 'More options'}</Text>
                <Animated.View style={[{ marginLeft: 4 }, chevronStyle]}>
                  <Feather name="chevron-down" size={16} color={colors.textMuted} />
                </Animated.View>
              </PressableOpacity>
            </Animated.View>
          ) : null}
        </Animated.View>

        {hasInvite ? (
          <View style={[styles.inviteBanner, { backgroundColor: colors.brandSoft }]}>
            <Feather name="check-circle" size={18} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[styles.inviteBannerText, { color: colors.textPrimary }]}>Your invite is saved. Sign in or sign up to join the group.</Text>
          </View>
        ) : (
          <Text style={[styles.inviteHint, { color: colors.textMuted }]}>
            Invited to a group? Tap the invite link again after signing in, or{' '}
            <Text style={{ color: colors.brand, fontWeight: '600' }} onPress={() => router.push('/join/code')}>enter an invite code</Text>.
          </Text>
        )}

        <Text style={[styles.footerText, { color: colors.textMuted }]}>
          By continuing, you agree to our
          <Text style={{ color: colors.brand }} onPress={handleOpenPrivacyPolicy}> Privacy Policy</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  logoArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 320, height: 196 },
  buttonGroup: { gap: 12, marginBottom: 20 },
  option: { minHeight: BUTTON_HEIGHT, borderRadius: BUTTON_RADIUS },
  appleButton: {
    width: '100%',
    height: BUTTON_HEIGHT,
    backgroundColor: '#000000',
    borderRadius: BUTTON_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shadow: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  googleLogo: { width: 20, height: 20 },
  moreToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  moreText: { fontWeight: '600', fontSize: fontSize.md },
  inviteBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  inviteBannerText: { flex: 1, fontSize: fontSize.md, lineHeight: 19 },
  inviteHint: { textAlign: 'center', fontSize: fontSize.sm, lineHeight: 18, paddingHorizontal: 8 },
  footerText: { textAlign: 'center', fontSize: fontSize.xs, lineHeight: 16, marginTop: 16, paddingHorizontal: 8 },
});

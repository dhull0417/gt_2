import React from 'react';
import { View, Text, StyleSheet, Alert, Linking, Platform } from 'react-native';
import { PressableOpacity } from '@/components/ui/PressableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import RevenueCatUI from 'react-native-purchases-ui';
import { useThemeColors } from '@/contexts/AppearanceContext';
import { usePremium } from '@/hooks/usePremium';
import { useRefreshPremium } from '@/hooks/usePurchases';
import { purchasesAvailable } from '@/utils/purchases';

const MANAGE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/account/subscriptions'
  : 'https://play.google.com/store/account/subscriptions';

/**
 * Premium paywall. The paywall UI itself is designed and published in the RevenueCat dashboard
 * (Paywalls -> the one attached to the current offering), so copy, layout and prices change there
 * without an app release. This screen only wraps it: purchase/restore callbacks ask OUR server to
 * re-check RevenueCat so Premium unlocks immediately, and an already-Premium owner sees a thank-you.
 */
export default function PaywallScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { isPremium } = usePremium();
  const refresh = useRefreshPremium();

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const onDone = async (title: string, message: string) => {
    try {
      await refresh();
    } catch {
      // The RevenueCat webhook will still flip Premium; the next app refresh picks it up.
    }
    Alert.alert(title, message, [{ text: 'Done', onPress: close }]);
  };

  if (isPremium) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="check-circle" size={40} color={colors.success} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>You're Premium</Text>
        <Text style={[styles.text, { color: colors.textMuted }]}>Thanks for supporting GroupThat.</Text>
        <PressableOpacity onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 15 }}>Manage subscription</Text>
        </PressableOpacity>
        <PressableOpacity onPress={close} style={{ marginTop: 18 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Close</Text>
        </PressableOpacity>
      </SafeAreaView>
    );
  }

  if (!purchasesAvailable()) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Feather name="info" size={28} color={colors.textFaint} />
        <Text style={[styles.text, { color: colors.textMuted, marginTop: 10 }]}>
          Subscriptions aren't available in this version of the app.
        </Text>
        <PressableOpacity onPress={close} style={{ marginTop: 18 }}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Close</Text>
        </PressableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <RevenueCatUI.Paywall
        options={{ displayCloseButton: true }}
        onPurchaseCompleted={() => onDone('Welcome to Premium', 'Premium is now active on the groups you own.')}
        onRestoreCompleted={() => onDone('Purchases restored', 'Premium is active again if we found a subscription.')}
        onPurchaseError={({ error }) => Alert.alert('Purchase failed', error?.message || 'You have not been charged.')}
        onDismiss={close}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  title: { fontSize: 20, fontWeight: '800', marginTop: 12 },
  text: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
});

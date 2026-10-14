import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { PurchasesPackage } from 'react-native-purchases';
import { useThemeColors } from '@/contexts/AppearanceContext';
import type { ThemeColors } from '@/constants/theme';
import { usePremium } from '@/hooks/usePremium';
import { usePackages, usePurchasePackage, useRestorePurchases } from '@/hooks/usePurchases';
import { purchasesAvailable } from '@/utils/purchases';

const PRIVACY_URL = 'https://groupthatapp.com/privacy-policy/';
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const MANAGE_URL = Platform.OS === 'ios'
  ? 'https://apps.apple.com/account/subscriptions'
  : 'https://play.google.com/store/account/subscriptions';

const FEATURES: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string }[] = [
  { icon: 'users', title: 'Waitlist with auto-promotion', text: 'Full meetups fill themselves when someone drops out.' },
  { icon: 'flag', title: 'Minimum headcount', text: 'Auto-cancel a meetup if too few people are in by the deadline.' },
  { icon: 'award', title: 'Priority RSVP', text: 'Give your regulars a head start before everyone else.' },
  { icon: 'truck', title: 'Rides & things to bring', text: 'Coordinate drivers, seats and who brings what.' },
  { icon: 'help-circle', title: 'Custom RSVP questions', text: 'Collect dietary needs, skill level, anything you like.' },
  { icon: 'smile', title: 'Custom RSVP reactions', text: 'Your own catchphrases and emoji for In and Out.' },
  { icon: 'grid', title: 'Team splits', text: 'Split everyone who is in into balanced teams.' },
  { icon: 'bar-chart-2', title: 'Stats & CSV export', text: 'Attendance history for every member.' },
];

const periodLabel = (pkg: PurchasesPackage) => {
  switch (pkg.packageType) {
    case 'ANNUAL': return 'Yearly';
    case 'MONTHLY': return 'Monthly';
    case 'WEEKLY': return 'Weekly';
    case 'LIFETIME': return 'Lifetime';
    default: return pkg.product.title;
  }
};
const periodSuffix = (pkg: PurchasesPackage) =>
  pkg.packageType === 'ANNUAL' ? '/ year' : pkg.packageType === 'MONTHLY' ? '/ month' : pkg.packageType === 'WEEKLY' ? '/ week' : '';

// Best value first: yearly, then monthly, then anything else.
const ORDER: Record<string, number> = { ANNUAL: 0, MONTHLY: 1 };
const sortPackages = (pkgs: PurchasesPackage[]) =>
  [...pkgs].sort((a, b) => (ORDER[a.packageType] ?? 9) - (ORDER[b.packageType] ?? 9));

export default function PaywallScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { isPremium } = usePremium();
  const { data, isLoading, isError, refetch } = usePackages();
  const buy = usePurchasePackage();
  const restoreMutation = useRestorePurchases();
  const packages = useMemo(() => sortPackages(data ?? []), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && packages.length > 0) setSelectedId(packages[0].identifier);
  }, [packages, selectedId]);

  const selected = packages.find((p) => p.identifier === selectedId) ?? null;
  const busy = buy.isPending || restoreMutation.isPending;

  const savings = useMemo(() => {
    const yearly = packages.find((p) => p.packageType === 'ANNUAL');
    const monthly = packages.find((p) => p.packageType === 'MONTHLY');
    if (!yearly || !monthly || monthly.product.price <= 0) return null;
    const pct = Math.round((1 - yearly.product.price / (monthly.product.price * 12)) * 100);
    return pct > 0 ? pct : null;
  }, [packages]);

  const onSubscribe = async () => {
    if (!selected || busy) return;
    try {
      const result = await buy.mutateAsync(selected);
      if (result === 'purchased') {
        Alert.alert('Welcome to Premium', 'Premium is now active on the groups you own.', [{ text: 'Done', onPress: () => router.back() }]);
      }
    } catch (err: any) {
      Alert.alert('Purchase failed', err?.message || 'Something went wrong. You have not been charged.');
    }
  };

  const onRestore = async () => {
    try {
      const user = await restoreMutation.mutateAsync();
      Alert.alert(
        user.isPremium ? 'Purchases restored' : 'Nothing to restore',
        user.isPremium ? 'Premium is active again.' : 'We could not find an active subscription for this account.',
      );
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message || 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.headerTitle}>GroupThat Premium</Text>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 40, alignItems: 'flex-end' }} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <Text style={styles.hero}>Run your group on autopilot</Text>
        <Text style={styles.sub}>
          Premium belongs to you as the organizer. It unlocks these tools for every group you own, for everyone in them.
        </Text>

        <View style={styles.card}>
          {FEATURES.map((f, i) => (
            <View key={f.title} style={[styles.featureRow, i > 0 && styles.featureDivider]}>
              <View style={styles.featureIcon}><Feather name={f.icon} size={16} color={colors.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            </View>
          ))}
        </View>

        {isPremium ? (
          <View style={[styles.card, { marginTop: 20, alignItems: 'center', paddingVertical: 24 }]}>
            <Feather name="check-circle" size={32} color={colors.success} />
            <Text style={[styles.hero, { fontSize: 18, marginTop: 10, marginBottom: 4 }]}>You're Premium</Text>
            <Text style={[styles.sub, { textAlign: 'center', marginBottom: 14 }]}>Thanks for supporting GroupThat.</Text>
            <TouchableOpacity onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})}>
              <Text style={styles.link}>Manage subscription</Text>
            </TouchableOpacity>
          </View>
        ) : !purchasesAvailable() ? (
          <View style={[styles.notice, { marginTop: 20 }]}>
            <Feather name="info" size={16} color={colors.textFaint} style={{ marginTop: 1 }} />
            <Text style={styles.noticeText}>Subscriptions aren't available in this version of the app.</Text>
          </View>
        ) : isLoading ? (
          <ActivityIndicator style={{ marginTop: 28 }} color={colors.brand} />
        ) : isError || packages.length === 0 ? (
          <View style={{ marginTop: 20 }}>
            <View style={styles.notice}>
              <Feather name="alert-circle" size={16} color={colors.textFaint} style={{ marginTop: 1 }} />
              <Text style={styles.noticeText}>We couldn't load subscription options from the store. Check your connection and try again.</Text>
            </View>
            <TouchableOpacity onPress={() => refetch()} style={{ alignSelf: 'center', marginTop: 12 }}><Text style={styles.link}>Try again</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={{ marginTop: 20 }}>
            {packages.map((pkg) => {
              const on = pkg.identifier === selectedId;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  onPress={() => setSelectedId(pkg.identifier)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${periodLabel(pkg)}, ${pkg.product.priceString} ${periodSuffix(pkg)}`}
                  style={[styles.plan, on && { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}
                >
                  <Feather name={on ? 'check-circle' : 'circle'} size={20} color={on ? colors.brand : colors.borderStrong} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.planTitle}>{periodLabel(pkg)}</Text>
                    {pkg.packageType === 'ANNUAL' && savings ? <Text style={styles.planBadge}>Save {savings}%</Text> : null}
                  </View>
                  <Text style={styles.planPrice}>{pkg.product.priceString}<Text style={styles.planSuffix}> {periodSuffix(pkg)}</Text></Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity onPress={onSubscribe} disabled={!selected || busy} activeOpacity={0.85} style={[styles.cta, (!selected || busy) && { opacity: 0.6 }]} accessibilityRole="button">
              {buy.isPending ? <ActivityIndicator color="white" /> : <Text style={styles.ctaText}>Subscribe</Text>}
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={onRestore} disabled={busy || !purchasesAvailable()} style={{ alignSelf: 'center', marginTop: 18 }}>
          {restoreMutation.isPending ? <ActivityIndicator size="small" color={colors.textFaint} /> : <Text style={styles.link}>Restore purchases</Text>}
        </TouchableOpacity>

        <Text style={styles.legal}>
          Payment is charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play'} account at confirmation. The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period. Manage or cancel it any time in your {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account settings.
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 8 }}>
          <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}><Text style={styles.legalLink}>Terms of Use</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}><Text style={styles.legalLink}>Privacy Policy</Text></TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  hero: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, marginTop: 22, marginBottom: 6 },
  sub: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 18 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 },
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  featureDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  featureIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  featureText: { fontSize: 12, color: colors.textMuted, marginTop: 1, lineHeight: 17 },
  plan: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 10 },
  planTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  planBadge: { fontSize: 12, fontWeight: '800', color: colors.success, marginTop: 2 },
  planPrice: { fontSize: 16, fontWeight: '800', color: colors.textPrimary },
  planSuffix: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  cta: { backgroundColor: colors.brand, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  ctaText: { color: 'white', fontSize: 17, fontWeight: '800' },
  link: { fontSize: 14, fontWeight: '700', color: colors.brand },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.surfaceAlt, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  legal: { fontSize: 11, color: colors.textFaint, lineHeight: 16, textAlign: 'center', marginTop: 22 },
  legalLink: { fontSize: 12, fontWeight: '600', color: colors.textMuted, textDecorationLine: 'underline' },
});

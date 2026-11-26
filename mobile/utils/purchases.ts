import { Platform } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';

// Public SDK keys (RevenueCat -> Project settings -> API keys -> the app's public key).
// These are safe to ship in the app; the SECRET key lives only on the backend.
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';

const apiKey = () => (Platform.OS === 'ios' ? IOS_KEY : Platform.OS === 'android' ? ANDROID_KEY : '');

let configured = false;
let configuredFor: string | null = null;

/** False on web, or when this build has no RevenueCat key (e.g. a local build without env vars). */
export const purchasesAvailable = () => !!apiKey();

/**
 * Starts RevenueCat for the signed-in user. The app user id is the Clerk id, which is exactly
 * what the backend looks up when RevenueCat's webhook fires. Safe to call repeatedly.
 */
export async function initPurchases(clerkId: string): Promise<boolean> {
  if (!purchasesAvailable()) return false;
  try {
    if (!configured) {
      Purchases.configure({ apiKey: apiKey(), appUserID: clerkId });
      configured = true;
      configuredFor = clerkId;
    } else if (configuredFor !== clerkId) {
      await Purchases.logIn(clerkId);
      configuredFor = clerkId;
    }
    return true;
  } catch (err) {
    console.warn('[purchases] init failed', err);
    return false;
  }
}

/** Detaches the device from the current user on sign-out so the next user doesn't inherit purchases. */
export async function resetPurchases(): Promise<void> {
  if (!configured || !configuredFor) return;
  try {
    await Purchases.logOut();
  } catch {
    // logOut throws if the current user is already anonymous; nothing to undo.
  }
  configuredFor = null;
}

/** Packages in the offering marked "current" in the RevenueCat dashboard. */
export async function getPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseResult = 'purchased' | 'cancelled';

export async function purchase(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (err: any) {
    if (err?.userCancelled) return 'cancelled';
    throw err;
  }
}

export async function restore(): Promise<void> {
  await Purchases.restorePurchases();
}

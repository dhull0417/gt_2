/**
 * Returns a close function that navigates away from the paywall at most once.
 *
 * RevenueCat's Paywall fires onDismiss when a purchase (or restore) succeeds, and the paywall
 * screen also closes from its "Welcome to Premium" alert. Both used to call router.back(), so the
 * second call popped whatever was under the paywall too: buying Premium mid group-creation threw
 * the user out of the flow and lost what they had entered. Create one closer per paywall visit.
 */
export const createPaywallCloser = (navigate: () => void) => {
    let closed = false;
    return () => {
        if (closed) return;
        closed = true;
        navigate();
    };
};

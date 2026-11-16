import { createPaywallCloser } from "../paywallClose";

describe("createPaywallCloser", () => {
    // RevenueCat's Paywall fires onDismiss when a purchase succeeds, and the screen also closes
    // from the "Welcome to Premium" alert. Two router.back() calls popped the screen under the
    // paywall too (e.g. kicked the user out of create-group mid-flow).
    it("navigates back only once when both onDismiss and the success alert close the paywall", () => {
        const navigate = jest.fn();
        const close = createPaywallCloser(navigate);

        close(); // onDismiss right after the purchase
        close(); // "Done" on the success alert

        expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("navigates on the first close", () => {
        const navigate = jest.fn();
        createPaywallCloser(navigate)();
        expect(navigate).toHaveBeenCalledTimes(1);
    });

    it("each paywall visit gets its own guard", () => {
        const navigate = jest.fn();
        createPaywallCloser(navigate)();
        createPaywallCloser(navigate)();
        expect(navigate).toHaveBeenCalledTimes(2);
    });
});

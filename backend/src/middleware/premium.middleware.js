import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";
import { hasPremium } from "../utils/premium.js";

/**
 * Blocks the request unless the caller has an active Premium entitlement.
 * Use AFTER protectRoute:
 *   router.post("/x", protectRoute, requirePremium, handler);
 *
 * Responds 403 { error: "premium_required" } so the app can open the paywall.
 */
export const requirePremium = async (req, res, next) => {
  try {
    const { userId } = getAuth(req);
    const user = await User.findOne({ clerkId: userId }).select("clerkId premium").lean();
    if (!hasPremium(user)) {
      return res.status(403).json({
        error: "premium_required",
        message: "This feature requires GroupThat Premium.",
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

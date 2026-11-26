import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { webhookAuthorized, syncPremiumForUser } from "../utils/revenuecat.js";

/**
 * @desc    RevenueCat webhook. The payload is only a hint about WHO changed; we then ask
 *          RevenueCat for their real status, so a forged or replayed message can't grant Premium.
 *          Returns non-200 on failure so RevenueCat retries (5 times over ~2.5 hours).
 * @route   POST /api/revenuecat/webhook
 */
export const handleWebhook = asyncHandler(async (req, res) => {
  if (!webhookAuthorized(req.headers.authorization)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const event = req.body?.event;
  if (!event) return res.status(400).json({ error: "Missing event." });

  // Everyone this event could concern: the user, their aliases, and both sides of a TRANSFER.
  const ids = new Set(
    [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []), ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
      .filter((id) => typeof id === "string" && id && !id.startsWith("$RCAnonymousID"))
  );
  if (ids.size === 0) return res.status(200).json({ ok: true, synced: 0 });

  const users = await User.find({ clerkId: { $in: [...ids] } });
  for (const user of users) await syncPremiumForUser(user);

  console.log(`[RevenueCat] ${event.type} (${event.environment}) -> synced ${users.length} user(s)`);
  res.status(200).json({ ok: true, synced: users.length });
});

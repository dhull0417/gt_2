/**
 * One-time (and safe to repeat): copies "who is in which group" from MongoDB into the
 * chat database (public.group_members), which the chat security rules check.
 *
 * Run BEFORE applying the chat lockdown SQL (kept out of git in _hold/supabase/), and again right
 * before it if many groups changed in between.
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (.env is read).
 * Run: node src/scripts/syncChatMembership.js
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { isConfigured } from "../utils/supabaseAdmin.js";

async function run() {
  if (!isConfigured()) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({}, "clerkId").lean();
  const clerkById = new Map(users.map((u) => [String(u._id), u.clerkId]));

  const base = process.env.SUPABASE_URL.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "resolution=ignore-duplicates,return=minimal" };

  let rows = [];
  let total = 0;
  const flush = async () => {
    if (rows.length === 0) return;
    const res = await fetch(`${base}/rest/v1/group_members?on_conflict=group_id,clerk_id`, { method: "POST", headers, body: JSON.stringify(rows) });
    if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`);
    total += rows.length;
    rows = [];
  };

  const cursor = Group.find({}, "members").lean().cursor();
  for await (const g of cursor) {
    for (const m of g.members || []) {
      const clerkId = clerkById.get(String(m));
      if (clerkId) rows.push({ group_id: String(g._id), clerk_id: clerkId });
      if (rows.length >= 500) await flush();
    }
  }
  await flush();

  console.log(`Synced ${total} membership row(s).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

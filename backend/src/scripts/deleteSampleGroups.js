// Deletes every sample group (and its meetups, chat, and everything else that belongs to it), the
// same way "Delete group" does, without notifying anyone. Sample groups were removed 2026-11-25.
//   cd backend && node src/scripts/deleteSampleGroups.js            # dry run: counts only
//   cd backend && node src/scripts/deleteSampleGroups.js --apply    # deletes them
// Needs MONGO_URI, and for --apply also SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the same values
// the server uses), so the chats are deleted too.
import "dotenv/config";
import mongoose from "mongoose";
import Group from "../models/group.model.js";
import Meetup from "../models/meetup.model.js";
import { deleteGroupAndData } from "../utils/groupCleanup.js";
import { isConfigured } from "../utils/supabaseAdmin.js";
import { findSampleGroups, summarize, deleteAll } from "./sampleGroups.js";

const apply = process.argv.includes("--apply");

await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
try {
  const groups = await findSampleGroups(Group.collection);
  const counts = {};
  for (const g of groups) counts[String(g._id)] = await Meetup.countDocuments({ group: g._id });
  const s = summarize(groups, counts);
  console.log(`Sample groups: ${s.groups}`);
  console.log(`  with members besides the owner: ${s.withOtherMembers}`);
  console.log(`  meetups that would go with them: ${s.meetups}`);

  if (!apply) {
    console.log(s.groups ? "Dry run. Nothing deleted. Run again with --apply to delete them." : "Nothing to do.");
  } else if (s.groups === 0) {
    console.log("Nothing to do.");
  } else if (!isConfigured()) {
    console.log("Not deleting: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY aren't set, so the chats would be left behind.");
    console.log("Add them to backend/.env (the same values the server uses) and run again.");
    process.exitCode = 1;
  } else {
    const result = await deleteAll(groups, deleteGroupAndData, (line) => console.log(line));
    console.log(`Done: ${result.deleted} deleted, ${result.failed.length} failed.`);
    if (result.failed.length) process.exitCode = 1;
  }
} finally {
  await mongoose.disconnect();
}

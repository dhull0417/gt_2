// Read-only: how many people still use an app build from before version reporting (1.3.x),
// to decide when to turn on the cutover switches and run the chat lockdown.
//   cd backend && node src/scripts/appVersionReport.js [days=14]
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/user.model.js";

const days = Number(process.argv[2]) || 14;
const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
try {
  const [legacy, modern, both, byVersion] = await Promise.all([
    User.countDocuments({ legacyAppSeenAt: { $gte: since } }),
    User.countDocuments({ appVersionSeenAt: { $gte: since } }),
    User.countDocuments({ legacyAppSeenAt: { $gte: since }, appVersionSeenAt: { $gte: since } }),
    User.aggregate([
      { $match: { appVersionSeenAt: { $gte: since } } },
      { $group: { _id: "$appVersion", people: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]),
  ]);
  console.log(`Last ${days} days (from ${since.toISOString().slice(0, 10)}):`);
  console.log(`  used an old app (1.3.x or older): ${legacy}`);
  console.log(`  used a new app (1.4.0+):          ${modern}`);
  console.log(`  used both (e.g. an old iPad):     ${both}`);
  for (const v of byVersion) console.log(`    ${v._id || "unknown"}: ${v.people}`);
  console.log("Old apps are only counted from the day this backend went live, so give it a few days.");
} finally {
  await mongoose.disconnect();
}

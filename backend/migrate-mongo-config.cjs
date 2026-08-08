require("dotenv").config();

const config = {
  mongodb: {
    url: process.env.MONGO_URI,
    databaseName: "gt_2",
    options: {}
  },

  migrationsDir: "src/migrations",
  changelogCollectionName: "changelog",
  lockCollectionName: "changelog_lock",
  lockTtl: 0,
  migrationFileExtension: ".cjs",
  useFileHash: false,

  // .cjs migration files run via require(), independent of the app's "type": "module" setting.
  moduleSystem: "commonjs",
};

module.exports = config;

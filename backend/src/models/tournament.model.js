import mongoose from "mongoose";

// Premium teams & tournaments: one event per meetup. Kept after the meetup is cleaned up so
// group Stats can show results. All rules live in utils/tournament/ (pure functions).
// Spec: docs/specs/2026-11-10-team-tournaments-design.md

const playerSchema = new mongoose.Schema({
  key: { type: String, required: true },                                   // user id, or guest:<hostClerkId>:<n>
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  guestOf: { type: String, default: null },                               // host's clerkId
  guestIndex: { type: Number, default: null },
}, { _id: false });

const teamSchema = new mongoose.Schema({
  key: { type: String, required: true },                                   // t1, t2, ... (used by matches)
  name: { type: String, default: null },                                   // null in singles
  seed: { type: Number, required: true },                                  // 1 = strongest
  players: [playerSchema],
}, { _id: false });

const slotSchema = new mongoose.Schema({
  team: { type: String, default: null },
  from: {
    type: new mongoose.Schema({
      match: { type: String, required: true },
      place: { type: Number },
      loser: { type: Boolean },
    }, { _id: false }),
    default: null,
  },
}, { _id: false });

const matchSchema = new mongoose.Schema({
  id: { type: String, required: true },
  round: { type: Number, required: true },
  order: { type: Number, required: true },
  bracket: { type: String, enum: ['winners', 'losers', 'final', null], default: null },
  advance: { type: Number, default: null },
  slots: [slotSchema],
  results: [{
    team: { type: String, required: true },
    place: { type: Number, required: true },
    points: { type: Number },
    _id: false,
  }],
  status: { type: String, enum: ['waiting', 'ready', 'done', 'bye'], default: 'waiting' },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reportedAt: { type: Date, default: null },
}, { _id: false });

const tournamentSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  meetup: { type: mongoose.Schema.Types.ObjectId, ref: "Meetup", required: true },
  meetupStartsAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'finished'], default: 'active' },
  mode: { type: String, enum: ['singles', 'teams'], required: true },
  format: { type: String, enum: ['none', 'roundRobin', 'single', 'double'], required: true },
  teamsPerMatch: { type: Number, enum: [2, 3, 4], default: 2 },
  resultType: { type: String, enum: ['points', 'winLoss', 'places'], default: 'winLoss' },
  teamSize: { type: Number, default: null },
  teamCount: { type: Number, default: null },
  weighting: {
    listId: { type: mongoose.Schema.Types.ObjectId, default: null },
    order: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],       // the ranking actually used
    balanceTeams: { type: Boolean, default: false },
    buildToFinale: { type: Boolean, default: false },
  },
  extraPlayers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],  // Undecided members the organizer ticked
  playersKey: { type: String, default: '' },
  teams: [teamSchema],
  matches: [matchSchema],
  champion: { type: String, default: null },                              // team key
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, optimisticConcurrency: true });

tournamentSchema.index({ meetup: 1 }, { unique: true });
tournamentSchema.index({ group: 1, status: 1, meetupStartsAt: -1 });

export default mongoose.model("Tournament", tournamentSchema);

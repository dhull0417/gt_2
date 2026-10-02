import mongoose from "mongoose";
import Meetup from "../models/meetup.model.js";

export const MAX_QUESTIONS = 5;
export const MAX_ANSWER_LENGTH = 300;
const TYPES = ["text", "choice", "yesno"];

/**
 * Validates a series' RSVP questions. Existing ids are kept (so people's answers survive
 * edits); new questions get fresh ids. Returns { questions } or { error }.
 */
export const parseQuestions = (raw, existing = []) => {
  if (raw == null) return { questions: [] };
  if (!Array.isArray(raw)) return { error: "Questions must be a list." };
  if (raw.length > MAX_QUESTIONS) return { error: `You can ask at most ${MAX_QUESTIONS} questions.` };
  const known = new Set((existing || []).map((q) => q._id.toString()));
  const questions = [];
  for (const q of raw) {
    const prompt = typeof q?.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) return { error: "Every question needs some text." };
    if (prompt.length > 140) return { error: "Questions can be at most 140 characters." };
    const type = TYPES.includes(q?.type) ? q.type : "text";
    let options = [];
    if (type === "choice") {
      const seen = new Set();
      for (const o of Array.isArray(q.options) ? q.options : []) {
        const text = typeof o === "string" ? o.trim() : "";
        if (!text || seen.has(text.toLowerCase())) continue;
        if (text.length > 60) return { error: "Choices can be at most 60 characters." };
        seen.add(text.toLowerCase());
        options.push(text);
      }
      if (options.length < 2 || options.length > 10) return { error: `"${prompt}" needs between 2 and 10 choices.` };
    }
    const entry = { prompt, type, options, required: !!q?.required };
    if (q?._id && known.has(String(q._id))) entry._id = new mongoose.Types.ObjectId(String(q._id));
    questions.push(entry);
  }
  return { questions };
};

/** Drops answers whose question is gone or whose chosen option no longer exists. */
export const pruneAnswers = (answers, questions) => {
  const byId = new Map(questions.map((q) => [q._id.toString(), q]));
  return (answers || []).filter((a) => {
    const q = byId.get(String(a.question));
    if (!q) return false;
    if (q.type === "choice") return (q.options || []).includes(a.value);
    if (q.type === "yesno") return a.value === "yes" || a.value === "no";
    return true;
  });
};

/** Pushes a series' questions onto its upcoming meetups, keeping answers that still apply. */
export const refreshSeriesQuestions = async (group, schedule) => {
  const meetups = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    status: "scheduled",
    date: { $gte: new Date() },
  }).select("answers").lean();

  const questions = (schedule.defaultQuestions || []).map((q) => ({
    _id: q._id, prompt: q.prompt, type: q.type, options: q.options || [], required: !!q.required,
  }));
  if (meetups.length === 0) return 0;
  await Meetup.bulkWrite(meetups.map((m) => ({
    updateOne: {
      filter: { _id: m._id, status: "scheduled" },
      update: { $set: { questions, answers: pruneAnswers(m.answers, questions) } },
    },
  })));
  return meetups.length;
};

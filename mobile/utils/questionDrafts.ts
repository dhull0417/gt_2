// Editable RSVP questions (the "ask people a few things when they're In" list): shared by the
// questions screen and the sheets used while creating a group, schedule or meetup.
import type { RsvpQuestion } from './api';

export const MAX_QUESTIONS = 5;
export const QUESTION_TYPE_LABELS: Record<RsvpQuestion['type'], string> = { text: 'Text', choice: 'Choices', yesno: 'Yes / No' };

export interface QuestionDraft {
  key: string;
  _id?: string;
  prompt: string;
  type: RsvpQuestion['type'];
  options: string[];
  required: boolean;
}

export const newQuestionKey = () => `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const blankQuestion = (): QuestionDraft => ({ key: newQuestionKey(), prompt: '', type: 'text', options: ['', ''], required: false });

export const draftsFromQuestions = (questions: { _id?: string; prompt: string; type: RsvpQuestion['type']; options: string[]; required?: boolean }[]): QuestionDraft[] =>
  questions.map(q => ({
    key: newQuestionKey(), _id: q._id, prompt: q.prompt, type: q.type,
    options: q.type === 'choice' ? [...q.options] : ['', ''], required: !!q.required,
  }));

/** Every question that can't be saved yet, with what to do about it. */
export const questionsProblems = (drafts: QuestionDraft[]): { key: string; message: string }[] =>
  drafts.flatMap(d => {
    if (!d.prompt.trim()) return [{ key: d.key, message: 'Type the question, or remove it' }];
    if (d.type === 'choice' && d.options.map(o => o.trim()).filter(Boolean).length < 2) return [{ key: d.key, message: 'Add at least 2 choices' }];
    return [];
  });

export const questionsPayload = (drafts: QuestionDraft[]) => drafts.map(d => ({
  ...(d._id ? { _id: d._id } : {}),
  prompt: d.prompt.trim(),
  type: d.type,
  options: d.type === 'choice' ? d.options.map(o => o.trim()).filter(Boolean) : [],
  required: d.required,
}));

export const questionsSummary = (drafts: QuestionDraft[]) =>
  drafts.length === 0 ? 'None' : `${drafts.length} question${drafts.length === 1 ? '' : 's'}`;

/**
 * Saves questions written before their schedules/meetup existed, once they do: drafts[i] goes to
 * ids[i]. Every save is tried; returns false if any failed (the caller tells the person).
 */
export async function saveDraftQuestions(
  drafts: (QuestionDraft[] | undefined)[],
  ids: (string | undefined)[],
  save: (id: string, questions: ReturnType<typeof questionsPayload>) => Promise<unknown>,
): Promise<boolean> {
  let ok = true;
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const id = ids[i];
    if (!d?.length) continue;
    if (!id) { ok = false; continue; }
    try { await save(id, questionsPayload(d)); } catch { ok = false; }
  }
  return ok;
}

import { saveDraftQuestions, blankQuestion, draftsFromQuestions, questionsProblems, questionsPayload, questionsSummary, MAX_QUESTIONS } from '../questionDrafts';

const q = (over: any = {}) => ({ ...blankQuestion(), ...over });

describe('question drafts', () => {
  it('a blank question is text, optional, with two empty choices ready', () => {
    expect(blankQuestion()).toMatchObject({ prompt: '', type: 'text', options: ['', ''], required: false });
    expect(MAX_QUESTIONS).toBe(5);
  });
  it('round-trips saved questions', () => {
    const d = draftsFromQuestions([{ _id: 'x', prompt: 'Diet?', type: 'choice', options: ['Veg', 'Any'], required: true } as any]);
    expect(d[0]).toMatchObject({ _id: 'x', prompt: 'Diet?', type: 'choice', options: ['Veg', 'Any'], required: true });
    expect(draftsFromQuestions([{ prompt: 'Shirt?', type: 'text', options: [], required: false } as any])[0].options).toEqual(['', '']);
  });
  it('problems point at the question that needs fixing', () => {
    const a = q({ key: 'a', prompt: '' });
    const b = q({ key: 'b', prompt: 'Diet?', type: 'choice', options: ['Veg', ' '] });
    const c = q({ key: 'c', prompt: 'Coming early?', type: 'yesno' });
    expect(questionsProblems([a, b, c])).toEqual([
      { key: 'a', message: 'Type the question, or remove it' },
      { key: 'b', message: 'Add at least 2 choices' },
    ]);
  });
  it('payload trims and drops empty choices', () => {
    expect(questionsPayload([q({ prompt: ' Diet? ', type: 'choice', options: [' Veg ', '', 'Any'], required: true }), q({ prompt: 'Notes', type: 'text', options: ['x'] })])).toEqual([
      { prompt: 'Diet?', type: 'choice', options: ['Veg', 'Any'], required: true },
      { prompt: 'Notes', type: 'text', options: [], required: false },
    ]);
  });
  it('summary', () => {
    expect(questionsSummary([])).toBe('None');
    expect(questionsSummary([q()])).toBe('1 question');
    expect(questionsSummary([q(), q()])).toBe('2 questions');
  });
});

describe('saveDraftQuestions', () => {
  const one = [{ ...blankQuestion(), prompt: 'Diet?' }];
  it('saves each list to the matching new id, skipping empty ones', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    expect(await saveDraftQuestions([one, undefined, []], ['s1', 's2', 's3'], save)).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('s1', [{ prompt: 'Diet?', type: 'text', options: [], required: false }]);
  });
  it('reports a failure but still tries the rest', async () => {
    const save = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    expect(await saveDraftQuestions([one, one], ['a', 'b'], save)).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('a missing id counts as a failure', async () => {
    expect(await saveDraftQuestions([one], [undefined], jest.fn())).toBe(false);
  });
});

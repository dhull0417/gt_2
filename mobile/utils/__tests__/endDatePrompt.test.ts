import { Alert } from 'react-native';
import { decideRemoveAfterEnd, askDeleteAfterEnd } from '../endDatePrompt';

const deps = (count: number | Error, answer: 'cancel' | 'keep' | 'delete' = 'keep') => ({
  countAfter: jest.fn(async () => { if (count instanceof Error) throw count; return count; }),
  ask: jest.fn(async () => answer),
});

describe('decideRemoveAfterEnd', () => {
  it('new schedules never ask', async () => {
    const d = deps(3);
    expect(await decideRemoveAfterEnd({ isNew: true, previous: null, next: '2027-03-15', ...d })).toBe(false);
    expect(d.countAfter).not.toHaveBeenCalled();
  });
  it('an unchanged or removed end date never asks', async () => {
    const d = deps(3);
    expect(await decideRemoveAfterEnd({ isNew: false, previous: '2027-03-15', next: '2027-03-15', ...d })).toBe(false);
    expect(await decideRemoveAfterEnd({ isNew: false, previous: '2027-03-15', next: null, ...d })).toBe(false);
    expect(d.countAfter).not.toHaveBeenCalled();
  });
  it('nothing after the new end date: saves without asking', async () => {
    const d = deps(0);
    expect(await decideRemoveAfterEnd({ isNew: false, previous: null, next: '2027-03-15', ...d })).toBe(false);
    expect(d.countAfter).toHaveBeenCalledWith('2027-03-15');
    expect(d.ask).not.toHaveBeenCalled();
  });
  it('meetups after it: Delete, Keep and Cancel', async () => {
    expect(await decideRemoveAfterEnd({ isNew: false, previous: null, next: '2027-03-15', ...deps(3, 'delete') })).toBe(true);
    expect(await decideRemoveAfterEnd({ isNew: false, previous: '2027-06-01', next: '2027-03-15', ...deps(3, 'keep') })).toBe(false);
    expect(await decideRemoveAfterEnd({ isNew: false, previous: null, next: '2027-03-15', ...deps(3, 'cancel') })).toBe('cancel');
  });
  it('if the count fails, saves and keeps (never deletes by accident)', async () => {
    const d = deps(new Error('offline'));
    expect(await decideRemoveAfterEnd({ isNew: false, previous: null, next: '2027-03-15', ...d })).toBe(false);
    expect(d.ask).not.toHaveBeenCalled();
  });
});

describe('askDeleteAfterEnd', () => {
  const thisYear = `${new Date().getFullYear()}-03-15`;
  const pressed = (label: string) => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons!.find(b => b.text === label)!.onPress!(); });
  };
  afterEach(() => jest.restoreAllMocks());

  it('asks with the agreed copy and no count', async () => {
    pressed('Keep');
    await askDeleteAfterEnd(thisYear);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('Delete meetups after Mar 15?');
    expect(body).toBe('Some meetups are already on the calendar after this date. Delete them, or keep them?');
    expect(body).not.toMatch(/\d/);
    expect(buttons.map((b: any) => [b.text, b.style])).toEqual([['Cancel', 'cancel'], ['Keep', undefined], ['Delete', 'destructive']]);
  });
  it('another year names the year', async () => {
    pressed('Keep');
    const y = new Date().getFullYear() + 1;
    await askDeleteAfterEnd(`${y}-03-15`);
    expect((Alert.alert as jest.Mock).mock.calls[0][0]).toBe(`Delete meetups after Mar 15, ${y}?`);
  });
  it('dismissing the dialog (Android back) cancels', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, _b, opts) => { opts!.onDismiss!(); });
    expect(await askDeleteAfterEnd(thisYear)).toBe('cancel');
  });
  it.each([['Cancel', 'cancel'], ['Keep', 'keep'], ['Delete', 'delete']])('%s answers %s', async (label, answer) => {
    pressed(label);
    expect(await askDeleteAfterEnd(thisYear)).toBe(answer);
  });
});

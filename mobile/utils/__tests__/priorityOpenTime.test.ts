import { priorityOpenStart } from '../priorityOpenTime';

const saved = { generationLeadDays: 4, generationLeadTime: '08:00 AM', generationDeadlineDays: 1, generationDeadlineTime: '06:00 PM' };

describe('priorityOpenStart', () => {
  it('uses the saved series when there are no unsaved edits', () => {
    expect(priorityOpenStart(saved, {})).toMatchObject({
      rsvpRestricted: true, leadEnabled: true, leadDays: 4, leadTime: '08:00 AM',
      deadlineEnabled: true, deadlineDays: 1, deadlineTime: '06:00 PM',
    });
  });

  it('prefers the edit screen\'s unsaved values', () => {
    const r = priorityOpenStart(saved, { leadDays: '2', leadTime: '7:00 PM', deadlineDays: '', deadlineTime: '' });
    expect(r).toMatchObject({ leadDays: 2, leadTime: '7:00 PM', deadlineEnabled: false });
  });

  it('takes an unsaved deadline too', () => {
    const r = priorityOpenStart(saved, { leadDays: '3', leadTime: '9:00 AM', deadlineDays: '2', deadlineTime: '10:00 AM' });
    expect(r).toMatchObject({ deadlineEnabled: true, deadlineDays: 2, deadlineTime: '10:00 AM' });
  });

  it('starts at 1 day before, 9:00 AM when the series has no open time', () => {
    expect(priorityOpenStart({ generationLeadDays: null, generationDeadlineDays: null }, {}))
      .toMatchObject({ leadDays: 1, leadTime: '09:00 AM', deadlineEnabled: false });
  });

  it('ignores a garbled leadDays param', () => {
    expect(priorityOpenStart(saved, { leadDays: 'abc', leadTime: '7:00 PM' })).toMatchObject({ leadDays: 4, leadTime: '08:00 AM' });
  });
});

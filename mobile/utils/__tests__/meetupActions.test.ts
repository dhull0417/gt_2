import { showTourneySetup } from '../meetupActions';

const meetup = (over: any = {}) => ({ status: 'scheduled', group: { _id: 'g', isPremium: true }, ...over } as any);

describe('showTourneySetup', () => {
  it('shows for a manager on a scheduled Premium meetup with no tournament', () => {
    expect(showTourneySetup({ canManage: true, meetup: meetup(), tournament: null })).toBe(true);
  });
  it('hides otherwise', () => {
    expect(showTourneySetup({ canManage: false, meetup: meetup(), tournament: null })).toBe(false);
    expect(showTourneySetup({ canManage: true, meetup: meetup({ group: { isPremium: false } }), tournament: null })).toBe(false);
    expect(showTourneySetup({ canManage: true, meetup: meetup({ status: 'past' }), tournament: null })).toBe(false);
    expect(showTourneySetup({ canManage: true, meetup: meetup(), tournament: { _id: 't' } })).toBe(false);
    expect(showTourneySetup({ canManage: true, meetup: meetup(), tournament: undefined })).toBe(false);
  });
});

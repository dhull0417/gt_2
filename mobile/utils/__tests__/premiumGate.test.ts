import { premiumFeaturesInUse, premiumHighlights, usesPremiumFeatures, submitMode, submitHint, type PremiumDraft } from '../premiumGate';

const base = (over: Partial<PremiumDraft> = {}): PremiumDraft => ({
  bringItems: [], ridesEnabled: false, questions: [], minAttendeesInput: '', rsvpRestricted: false, deadlineEnabled: false, ...over,
});
const q = (prompt: string) => ({ prompt, type: 'text', options: ['', ''], required: false });

describe('premiumFeaturesInUse', () => {
  it('is all false for an empty draft', () => {
    expect(premiumFeaturesInUse(base())).toEqual({ bring: false, rides: false, questions: false, minimum: false, priority: false });
  });
  it('detects each feature on its own', () => {
    expect(premiumFeaturesInUse(base({ bringItems: [{ name: 'Chips', max: '' }] })).bring).toBe(true);
    expect(premiumFeaturesInUse(base({ ridesEnabled: true })).rides).toBe(true);
    expect(premiumFeaturesInUse(base({ questions: [q('Allergies?')] })).questions).toBe(true);
    expect(premiumFeaturesInUse(base({ rsvpRestricted: true, deadlineEnabled: true, minAttendeesInput: '5' })).minimum).toBe(true);
  });
  it('ignores a blank bring item name and a blank question prompt', () => {
    expect(premiumFeaturesInUse(base({ bringItems: [{ name: '  ', max: '' }] })).bring).toBe(false);
    expect(premiumFeaturesInUse(base({ questions: [q(' ')] })).questions).toBe(false);
  });
  it('only counts a minimum that would be saved', () => {
    expect(premiumFeaturesInUse(base({ minAttendeesInput: '5' })).minimum).toBe(false);
    expect(premiumFeaturesInUse(base({ rsvpRestricted: true, minAttendeesInput: '5' })).minimum).toBe(false);
    expect(premiumFeaturesInUse(base({ deadlineEnabled: true, minAttendeesInput: '5' })).minimum).toBe(false);
    expect(premiumFeaturesInUse(base({ rsvpRestricted: true, deadlineEnabled: true, minAttendeesInput: '0' })).minimum).toBe(false);
    expect(premiumFeaturesInUse(base({ rsvpRestricted: true, deadlineEnabled: true, minAttendeesInput: '' })).minimum).toBe(false);
  });
});

describe('usesPremiumFeatures', () => {
  it('is false when nothing is in use', () => {
    expect(usesPremiumFeatures(base())).toBe(false);
  });
  it('is true when something is in use and there is no baseline', () => {
    expect(usesPremiumFeatures(base({ ridesEnabled: true }))).toBe(true);
  });
  it('is false when the premium settings equal the baseline (e.g. a lapsed group editing something else)', () => {
    const d = base({ bringItems: [{ name: 'Chips', max: '' }] });
    expect(usesPremiumFeatures(d, base({ bringItems: [{ name: 'Chips', max: '' }] }))).toBe(false);
  });
  it('is true when in-use settings differ from the baseline', () => {
    const d = base({ bringItems: [{ name: 'Chips', max: '' }] });
    expect(usesPremiumFeatures(d, base())).toBe(true);
    expect(usesPremiumFeatures(d, base({ bringItems: [{ name: 'Chips', max: '3' }] }))).toBe(true);
  });
  it('is false when the user cleared everything, even if the baseline had premium settings', () => {
    expect(usesPremiumFeatures(base(), base({ ridesEnabled: true }))).toBe(false);
  });
});

describe('submitMode', () => {
  it('confirms for Premium groups and for drafts using no Premium feature', () => {
    expect(submitMode({ usesPremium: true, isPremium: true, isOwner: true })).toBe('confirm');
    expect(submitMode({ usesPremium: true, isPremium: true, isOwner: false })).toBe('confirm');
    expect(submitMode({ usesPremium: false, isPremium: false, isOwner: true })).toBe('confirm');
    expect(submitMode({ usesPremium: false, isPremium: false, isOwner: false })).toBe('confirm');
  });
  it('asks the owner to upgrade and tells a non-owner the owner needs Premium', () => {
    expect(submitMode({ usesPremium: true, isPremium: false, isOwner: true })).toBe('upgrade');
    expect(submitMode({ usesPremium: true, isPremium: false, isOwner: false })).toBe('ownerNeeds');
  });
});

describe('submitHint', () => {
  it('has exact copy', () => {
    expect(submitHint('confirm')).toBe('');
    expect(submitHint('upgrade')).toBe('Premium is needed to save these settings.');
    expect(submitHint('ownerNeeds')).toBe('The group owner needs Premium to save these settings.');
  });
});

describe('premiumHighlights', () => {
  const draft = base({ bringItems: [{ name: 'Chips', max: '' }], ridesEnabled: true });
  it('marks the features in use while the footer asks for Premium', () => {
    expect(premiumHighlights(draft, 'upgrade')).toEqual({ bring: true, rides: true, questions: false, minimum: false, priority: false });
    expect(premiumHighlights(draft, 'ownerNeeds')).toEqual({ bring: true, rides: true, questions: false, minimum: false, priority: false });
  });
  it('marks nothing when the draft can be saved', () => {
    expect(premiumHighlights(draft, 'confirm')).toEqual({ bring: false, rides: false, questions: false, minimum: false, priority: false });
  });
});

describe('priority RSVP', () => {
  it('counts as a Premium feature when switched on', () => {
    expect(premiumFeaturesInUse(base({ priorityEnabled: true })).priority).toBe(true);
    expect(usesPremiumFeatures(base({ priorityEnabled: true }))).toBe(true);
  });
  it('switching it off is not a Premium change', () => {
    expect(usesPremiumFeatures(base({ priorityEnabled: false }), base({ priorityEnabled: true }))).toBe(false);
  });
  it('is highlighted while the footer asks for Premium', () => {
    expect(premiumHighlights(base({ priorityEnabled: true }), 'upgrade').priority).toBe(true);
  });
});

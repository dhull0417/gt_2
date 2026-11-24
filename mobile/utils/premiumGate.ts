// Which Premium features a meetup/schedule draft uses, and which footer button that calls for.
// Premium belongs to the group's owner, so a free group can be set up in full but not saved.
// No React in here.

export type PremiumDraft = {
    bringItems: { name: string; max: string }[];
    ridesEnabled: boolean;
    questions?: { prompt: string; type: string; options: string[]; required: boolean }[];
    minAttendeesInput: string;
    rsvpRestricted: boolean;
    deadlineEnabled: boolean;
};

/** Mirrors what actually gets saved: a minimum only counts with an RSVP window and a deadline. */
const minimumValue = (d: PremiumDraft): number => {
    if (!d.rsvpRestricted || !d.deadlineEnabled) return 0;
    const n = parseInt(d.minAttendeesInput, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
};

export const premiumFeaturesInUse = (d: PremiumDraft) => ({
    bring: d.bringItems.some(i => i.name.trim() !== ''),
    rides: d.ridesEnabled,
    questions: (d.questions ?? []).some(q => q.prompt.trim() !== ''),
    minimum: minimumValue(d) > 0,
});

/** Only the parts that would be saved, so blank rows and ignored values don't count as a change. */
const normalized = (d: PremiumDraft) => JSON.stringify({
    bring: d.bringItems.filter(i => i.name.trim() !== '').map(i => [i.name.trim(), i.max]),
    rides: d.ridesEnabled,
    questions: (d.questions ?? []).filter(q => q.prompt.trim() !== '').map(q => [q.prompt.trim(), q.type, q.options, q.required]),
    minimum: minimumValue(d),
});

/**
 * Does saving this draft need Premium? With a `baseline` (the draft as it was opened), only
 * changes count, so a group whose Premium lapsed can still save an unrelated edit.
 */
export const usesPremiumFeatures = (d: PremiumDraft, baseline?: PremiumDraft): boolean => {
    const inUse = Object.values(premiumFeaturesInUse(d)).some(Boolean);
    if (!inUse) return false;
    return baseline ? normalized(d) !== normalized(baseline) : true;
};

export type SubmitMode = 'confirm' | 'upgrade' | 'ownerNeeds';

export const submitMode = ({ usesPremium, isPremium, isOwner }: { usesPremium: boolean; isPremium: boolean; isOwner: boolean }): SubmitMode => {
    if (isPremium || !usesPremium) return 'confirm';
    return isOwner ? 'upgrade' : 'ownerNeeds';
};

export const submitHint = (mode: SubmitMode): string => {
    if (mode === 'upgrade') return 'Premium is needed to save these settings.';
    if (mode === 'ownerNeeds') return 'The group owner needs Premium to save these settings.';
    return '';
};

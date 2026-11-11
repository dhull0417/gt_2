// Text helpers for the Premium section of the schedule screens. No React in here.
import type { BringItemDraft } from "./editScheduleDraft";

/** One line for the collapsed Premium header: what's set up, or what's inside when nothing is. */
export const premiumSectionSummary = (bringItems: BringItemDraft[], ridesEnabled: boolean): string => {
    const parts: string[] = [];
    if (bringItems.length > 0) parts.push(`${bringItems.length} item${bringItems.length === 1 ? "" : "s"} to bring`);
    if (ridesEnabled) parts.push("Rides on");
    return parts.length > 0 ? parts.join(" · ") : "Things to bring, rides and more";
};

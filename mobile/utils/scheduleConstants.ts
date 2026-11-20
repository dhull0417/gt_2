// Constants and helpers shared by the create-group and group-edit-schedule screens.
// Only things that were byte-for-byte equivalent in both screens live here.

import { timeStringToDate } from '@/utils/timeString';

export const DAYS_OF_WEEK = [
    { label: "Sunday",    short: "Sun", value: 0 },
    { label: "Monday",    short: "Mon", value: 1 },
    { label: "Tuesday",   short: "Tue", value: 2 },
    { label: "Wednesday", short: "Wed", value: 3 },
    { label: "Thursday",  short: "Thu", value: 4 },
    { label: "Friday",    short: "Fri", value: 5 },
    { label: "Saturday",  short: "Sat", value: 6 },
];

export const ORDINAL_OCCURRENCES = ["1st", "2nd", "3rd", "4th", "5th", "Last"];

export const USA_TIMEZONES = [
    { label: "Eastern (ET)",      value: "America/New_York"    },
    { label: "Central (CT)",      value: "America/Chicago"     },
    { label: "Mountain (MT)",     value: "America/Denver"      },
    { label: "Mountain (no DST)", value: "America/Phoenix"     },
    { label: "Pacific (PT)",      value: "America/Los_Angeles" },
    { label: "Alaska (AKT)",      value: "America/Anchorage"   },
    { label: "Hawaii (HT)",       value: "Pacific/Honolulu"    },
];

// Short badge for the compact timezone pill — mirrors the abbreviations already
// used elsewhere (e.g. GroupDetailsView) so the same zone reads the same way everywhere.
export const TZ_ABBR: Record<string, string> = {
    "America/New_York": "ET",
    "America/Chicago": "CT",
    "America/Denver": "MT",
    "America/Phoenix": "MST",
    "America/Los_Angeles": "PT",
    "America/Anchorage": "AKST",
    "Pacific/Honolulu": "HST",
};

export const FREQ_LABELS: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", biweekly: "Bi-Weekly",
    monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semi-annually",
    yearly: "Yearly", custom: "Multiple Rules",
};

export const uid = () => Math.random().toString(36).slice(2);

// English ordinal suffix: 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... 31st.
// (The old version only handled 1-3, so month dates rendered as "21th", "22th", "23th", "31th".)
export const ordSfx = (n: number) => {
    if (n > 3 && n < 21) return "th";
    switch (n % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
    }
};

// Shared by the inline error and Continue-button gate. Empty input = "not yet answered", not
// invalid, so the field doesn't flash red before typing. Time-of-day matters because RSVP open
// and deadline can land on the same day-count — comparing leadDays >= deadlineDays isn't enough.
export const timeToMinutes = (time: string): number => {
    const t = timeStringToDate(time);
    return t.getHours() * 60 + t.getMinutes();
};

export const getMaxAttendeesError = (mode: "unlimited" | "limited", input: string): string | null => {
    if (mode !== "limited" || input === "") return null;
    if (!/^\d+$/.test(input)) return "Numbers only, please.";
    const n = parseInt(input, 10);
    if (n < 1 || n > 200) return "Enter a number between 1 and 200.";
    return null;
};

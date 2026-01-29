import { Schedule, Routine, DayTime } from './api';

/**
 * Formats a raw schedule object into a human-readable string.
 * PROJECT 7 UPDATE: Now supports nested Routines and the Ordinal frequency.
 * FIXED: Applied type casting to resolve "Property does not exist on type Schedule" errors.
 */
export const formatSchedule = (schedule: Schedule): string => {
  // Casting to any here ensures we can access routines and legacy properties 
  // without triggering TypeScript resolution errors while the global interface syncs.
  const { frequency, routines, days: legacyDays } = schedule as any;

  // 1. If it's a "Multiple Rules" schedule, format the routines list
  if (frequency === 'custom' && routines && routines.length > 0) {
    const parts = routines.map((r: Routine) => formatSingleRoutine(r));
    return parts.join(" & ");
  }

  // 2. Otherwise, treat the Schedule object itself as a single routine for formatting
  // This maintains backward compatibility with simple schedules
  return formatSingleRoutine({
    frequency,
    days: legacyDays,
    dayTimes: (schedule as any).dayTimes || [],
    rules: (schedule as any).rules
  } as any);
};

/**
 * HELPER: formatSingleRoutine
 * Handles the logic for a specific frequency pattern.
 */
const formatSingleRoutine = (routine: Routine & { days?: number[] }): string => {
  const { frequency, dayTimes, rules, days: legacyDays } = routine;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayNamesPlural = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

  const getSuffix = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return "st";
      case 2: return "nd";
      case 3: return "rd";
      default: return "th";
    }
  };

  if (frequency === 'daily') return "Daily";

  // Handle Weekly / Biweekly
  if (frequency === 'weekly' || frequency === 'biweekly') {
    const prefix = frequency === 'biweekly' ? "Every 2 weeks on " : "Weekly on ";
    
    // Extract unique days from dayTimes or legacy days array
    const targetDays = dayTimes?.length > 0 
      ? Array.from(new Set(dayTimes.map(dt => dt.day!))) 
      : legacyDays || [];

    if (targetDays.length === 0) return frequency === 'biweekly' ? "Every 2 weeks" : "Weekly";
    
    const sortedDays = [...targetDays].sort((a, b) => a - b);
    const names = sortedDays.map(d => dayNamesPlural[d]);
    
    if (names.length > 1) {
      return prefix + names.slice(0, -1).join(", ") + " & " + names.slice(-1);
    }
    return prefix + names[0];
  }

  // Handle Monthly
  if (frequency === 'monthly') {
    const targetDates = dayTimes?.length > 0 
      ? Array.from(new Set(dayTimes.map(dt => dt.date!))) 
      : legacyDays || [];

    if (targetDates.length === 0) return "Monthly";
    
    const sortedDates = [...targetDates].sort((a, b) => a - b);
    const formattedDates = sortedDates.map(d => `${d}${getSuffix(d)}`);
    
    if (formattedDates.length > 1) {
      return `Monthly on the ${formattedDates.slice(0, -1).join(", ")} & ${formattedDates.slice(-1)}`;
    }
    return `Monthly on the ${formattedDates[0]}`;
  }

  // Handle Ordinal (e.g., 2nd Wednesday)
  if (frequency === 'ordinal' && rules && rules.length > 0) {
    const rule = rules[0];
    if (rule.type === 'byDay') {
        return `${rule.occurrence} ${dayNames[rule.day!]}`;
    }
  }

  return "Recurring Schedule";
};
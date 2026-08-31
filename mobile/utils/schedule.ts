import { Schedule, Routine, DayTime } from './api';

// Formats a schedule to a readable string; supports nested Routines and Ordinal frequency.
export const formatSchedule = (schedule: Schedule): string => {
  // Cast to any to access routines/legacy fields ahead of the Schedule type update.
  const { frequency, routines, days: legacyDays } = schedule as any;

  // Real API data never sets a top-level `frequency` on the schedule itself
  // (only locally-built ScheduleData does, mid-edit) — so routine count, not
  // that field, is what actually distinguishes "Multiple Rules" from a
  // single routine here.
  if (routines && routines.length > 1) {
    const parts = routines.map((r: Routine) => formatSingleRoutine(r));
    return parts.join(" & ");
  }
  if (routines && routines.length === 1) {
    return formatSingleRoutine(routines[0]);
  }

  // Fully legacy/local shape with no routines array at all.
  return formatSingleRoutine({
    frequency,
    days: legacyDays,
    dayTimes: (schedule as any).dayTimes || [],
    rules: (schedule as any).rules
  } as any);
};

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

  // Handle Ordinal (e.g., 2nd Wednesday, possibly combined with others like Last Sunday)
  if (frequency === 'ordinal' && rules && rules.length > 0) {
    const labels = rules
      .filter(rule => rule.type === 'byDay')
      .map(rule => `${rule.occurrence} ${dayNames[rule.day!]}`);
    if (labels.length > 0) {
      return labels.join(" & ");
    }
  }

  return "Recurring Schedule";
};
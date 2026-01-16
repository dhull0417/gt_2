import { Schedule } from './api';

/**
 * Formats a raw schedule object into a human-readable string.
 * This utility handles Daily, Weekly, Bi-weekly, Monthly, and Custom frequencies.
 */
export const formatSchedule = (schedule: Schedule): string => {
  const { frequency, days, rules } = schedule;
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

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const prefix = frequency === 'biweekly' ? "Every 2 weeks on " : "Weekly on ";
    if (!days || days.length === 0) return frequency === 'biweekly' ? "Every 2 weeks" : "Weekly";
    
    const sortedDays = [...days].sort((a, b) => a - b);
    const names = sortedDays.map(d => dayNamesPlural[d]);
    
    if (names.length > 1) {
      return prefix + names.slice(0, -1).join(", ") + " & " + names.slice(-1);
    }
    return prefix + names[0];
  }

  if (frequency === 'monthly') {
    if (!days || days.length === 0) return "Monthly";
    const sortedDates = [...days].sort((a, b) => a - b);
    const formattedDates = sortedDates.map(d => `${d}${getSuffix(d)}`);
    
    if (formattedDates.length > 1) {
      return `Monthly on the ${formattedDates.slice(0, -1).join(", ")} & ${formattedDates.slice(-1)}`;
    }
    return `Monthly on the ${formattedDates[0]}`;
  }

  if (frequency === 'custom' && rules && rules.length > 0) {
    const description = rules.map(rule => {
      if (rule.type === 'byDay') {
        return `${rule.occurrence} ${dayNames[rule.day!]}`;
      }
      if (rule.type === 'byDate') {
        const sorted = [...(rule.dates || [])].sort((a, b) => a - b);
        const formatted = sorted.map(d => `${d}${getSuffix(d)}`);
        if (formatted.length > 1) {
          return `the ${formatted.slice(0, -1).join(", ")} & ${formatted.slice(-1)}`;
        }
        return `the ${formatted[0]}`;
      }
      return "";
    }).filter(Boolean).join(" and ");
    
    return description ? `Custom: ${description} of the month` : "Custom Schedule";
  }

  return "Recurring Schedule";
};
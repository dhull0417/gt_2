import { USA_TIMEZONES, TZ_ABBR } from './scheduleConstants';

const FALLBACK_TZ = 'America/Denver';

/** The phone's own timezone, used to pre-fill new groups so nobody has to hunt for it. */
export const deviceTimeZone = (): string => {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return tz && isValidTimeZone(tz) ? tz : FALLBACK_TZ;
    } catch {
        return FALLBACK_TZ;
    }
};

export const isValidTimeZone = (tz: string): boolean => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
};

// Used when the JS engine can't list every zone itself.
const COMMON_ZONES = [
    'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/Mexico_City',
    'America/Bogota', 'America/Lima', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Santiago',
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome',
    'Europe/Amsterdam', 'Europe/Stockholm', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow',
    'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
    'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong',
    'Asia/Shanghai', 'Asia/Manila', 'Asia/Seoul', 'Asia/Tokyo',
    'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland', 'Pacific/Guam',
];

const prettyZone = (tz: string): string => tz.split('/').slice(1).join(' / ').replace(/_/g, ' ') || tz;

const allZoneIds = (): string[] => {
    try {
        const fn = (Intl as any).supportedValuesOf;
        if (typeof fn === 'function') {
            const list: string[] = fn.call(Intl, 'timeZone');
            if (list?.length) return list;
        }
    } catch { /* fall through */ }
    return COMMON_ZONES;
};

/** Short name for a zone ("MT", "EST", "GMT+1"). US zones keep the labels used elsewhere in the app. */
export const tzAbbr = (tz: string): string => {
    if (TZ_ABBR[tz]) return TZ_ABBR[tz];
    try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
            .formatToParts(new Date())
            .find((p) => p.type === 'timeZoneName');
        return part?.value || tz;
    } catch {
        return tz;
    }
};

export const timezoneLabel = (tz: string): string => {
    const us = USA_TIMEZONES.find((t) => t.value === tz);
    if (us) return us.label;
    return `${prettyZone(tz)} (${tzAbbr(tz)})`;
};

/** US zones first, the phone's own zone next (if it isn't a US one), then everything else A-Z. */
export const timezoneOptions = (current?: string): { key: string; label: string }[] => {
    const seen = new Set<string>();
    const out: { key: string; label: string }[] = [];
    const add = (tz?: string) => {
        if (!tz || seen.has(tz)) return;
        seen.add(tz);
        out.push({ key: tz, label: timezoneLabel(tz) });
    };
    USA_TIMEZONES.forEach((t) => add(t.value));
    add(deviceTimeZone());
    add(current);
    allZoneIds().slice().sort().forEach(add);
    return out;
};

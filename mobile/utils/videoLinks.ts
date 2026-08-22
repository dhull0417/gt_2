export type VideoService = 'zoom' | 'google-meet' | 'teams';

const VIDEO_SERVICE_HOSTS: { service: VideoService; pattern: RegExp }[] = [
    { service: 'zoom', pattern: /(^|\.)zoom\.us$/i },
    { service: 'google-meet', pattern: /(^|\.)meet\.google\.com$/i },
    { service: 'teams', pattern: /(^|\.)(teams\.microsoft\.com|teams\.live\.com)$/i },
];

export function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value.trim());
}

export function detectVideoService(location: string | undefined | null): VideoService | null {
    if (!location || !isHttpUrl(location)) return null;
    try {
        const { hostname } = new URL(location.trim());
        return VIDEO_SERVICE_HOSTS.find(({ pattern }) => pattern.test(hostname))?.service ?? null;
    } catch {
        return null;
    }
}

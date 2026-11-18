import { getErrorMessage, OFFLINE_ERROR_MESSAGE, SLOW_SERVER_MESSAGE } from '../networkError';

const axiosErr = (extra: Record<string, unknown>) => Object.assign(new Error('x'), { isAxiosError: true, ...extra });

describe('getErrorMessage', () => {
  it('a timeout while online is a slow server, not "no internet"', () => {
    expect(getErrorMessage(axiosErr({ code: 'ECONNABORTED' }), 'Failed.', true)).toBe(SLOW_SERVER_MESSAGE);
  });
  it('a timeout while offline is offline', () => {
    expect(getErrorMessage(axiosErr({ code: 'ECONNABORTED' }), 'Failed.', false)).toBe(OFFLINE_ERROR_MESSAGE);
  });
  it('no network at all is offline whatever NetInfo thinks', () => {
    expect(getErrorMessage(axiosErr({ code: 'ERR_NETWORK' }), 'Failed.', true)).toBe(OFFLINE_ERROR_MESSAGE);
  });
  it("shows the server's own reason when it answered", () => {
    expect(getErrorMessage(axiosErr({ response: { status: 409, data: { error: 'Meetup is full.' } } }), 'Failed.', true)).toBe('Meetup is full.');
  });
  it('any other error offline (e.g. sign-in token refresh failed) is offline', () => {
    expect(getErrorMessage(new Error('token'), 'Failed.', false)).toBe(OFFLINE_ERROR_MESSAGE);
    expect(getErrorMessage(new Error('token'), 'Failed.', true)).toBe('Failed.');
  });
});

describe('isGroupThatReachable', () => {
  const { isGroupThatReachable } = require('../networkError');
  it('is reachable when the health route answers', () => {
    expect(isGroupThatReachable(204, '')).toBe(true);
  });
  it('is still reachable on an older backend without the route (Express default 404)', () => {
    expect(isGroupThatReachable(404, '<pre>Cannot GET /api/health</pre>')).toBe(true);
  });
  it('is not reachable behind a captive portal or other page', () => {
    expect(isGroupThatReachable(200, '<html>Hotel Wi-Fi login</html>')).toBe(false);
    expect(isGroupThatReachable(302, '')).toBe(false);
    expect(isGroupThatReachable(404, 'Not found')).toBe(false);
    expect(isGroupThatReachable(503, '')).toBe(false);
  });
});

describe('friendly wording for network failures', () => {
  const { isNetworkFailure, friendlyErrorText } = require('../networkError');
  const { clerkErrorMessage } = require('../clerkErrors');
  const { apiError } = require('../tournamentApi');

  it.each([
    ['axios', Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' })],
    ['fetch (React Native)', new TypeError('Network request failed')],
    ['supabase error object', { message: 'TypeError: Network request failed', details: '', hint: '', code: '' }],
    ['Clerk', Object.assign(new Error('ClerkJS: Network error at "https://x" - TypeError: Network request failed'), { code: 'network_error' })],
    ['RevenueCat', { message: 'Error performing request because the internet connection appears to be offline.' }],
    ['plain string', 'Network Error'],
  ])('recognizes a %s network failure', (_label, err) => {
    expect(isNetworkFailure(err)).toBe(true);
  });

  it('does not treat real server reasons as network failures', () => {
    expect(isNetworkFailure(new Error('Meetup is full.'))).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });

  it('getErrorMessage says offline for a non-axios network failure even when NetInfo says online', () => {
    expect(getErrorMessage(new TypeError('Network request failed'), 'Failed to edit message.', true)).toBe(OFFLINE_ERROR_MESSAGE);
  });

  it('friendlyErrorText replaces raw network text and keeps everything else', () => {
    expect(friendlyErrorText('Network Error')).toBe(OFFLINE_ERROR_MESSAGE);
    expect(friendlyErrorText('Meetup is full.')).toBe('Meetup is full.');
  });

  it('clerkErrorMessage never shows Clerk\'s raw network error', () => {
    const err = Object.assign(new Error('ClerkJS: Network error at "https://x"'), { code: 'network_error' });
    expect(clerkErrorMessage(err, 'Sign in failed.')).toBe(OFFLINE_ERROR_MESSAGE);
    expect(clerkErrorMessage({ errors: [{ longMessage: 'Password is incorrect.' }] }, 'x')).toBe('Password is incorrect.');
  });

  it('apiError (tournaments) never shows "Network Error"', () => {
    const err = Object.assign(new Error('Network Error'), { isAxiosError: true, code: 'ERR_NETWORK' });
    expect(apiError(err).message).toBe(OFFLINE_ERROR_MESSAGE);
    expect(apiError({ response: { data: { error: 'results_exist', message: 'Results exist.' } } })).toEqual({ code: 'results_exist', message: 'Results exist.' });
  });
});

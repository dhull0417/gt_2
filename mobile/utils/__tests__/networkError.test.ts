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

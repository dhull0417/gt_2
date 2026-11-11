import { currentUserGate } from '../offlineState';

describe('currentUserGate', () => {
  const base = { isSignedIn: true, hasUser: false, isError: false, errorStatus: undefined as number | undefined, fetchStatus: 'fetching' as const };

  it('waits while the first load is in flight', () => {
    expect(currentUserGate(base)).toBe('loading');
  });
  it('is ready as soon as there is a user, saved or fresh, even offline', () => {
    expect(currentUserGate({ ...base, hasUser: true, fetchStatus: 'paused' })).toBe('ready');
  });
  it('sends a brand-new account (404) to profile setup', () => {
    expect(currentUserGate({ ...base, isError: true, errorStatus: 404, fetchStatus: 'idle' })).toBe('new-user');
  });
  it('reports offline when the load is waiting for a connection and nothing is saved', () => {
    expect(currentUserGate({ ...base, fetchStatus: 'paused' })).toBe('offline');
  });
  it('reports failed for any other error with nothing saved', () => {
    expect(currentUserGate({ ...base, isError: true, errorStatus: 500, fetchStatus: 'idle' })).toBe('failed');
  });
  it('has nothing to wait for when signed out', () => {
    expect(currentUserGate({ ...base, isSignedIn: false, fetchStatus: 'idle' })).toBe('signed-out');
  });
});

describe('refreshOrToast', () => {
  const { refreshOrToast } = require('../offlineState');

  it('offline: says so and finishes at once, without starting requests that would hang', async () => {
    const fetchA = jest.fn(() => new Promise(() => {}));
    const notify = jest.fn();
    await refreshOrToast(false, [fetchA], notify);
    expect(fetchA).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("You're offline. Showing saved data.");
  });

  it('online: waits for every refresh, and a failed one does not throw', async () => {
    const order: string[] = [];
    const a = jest.fn(async () => { order.push('a'); });
    const b = jest.fn(async () => { throw new Error('boom'); });
    await expect(refreshOrToast(true, [a, b], jest.fn())).resolves.toBeUndefined();
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});

describe('isOfflineEmpty', () => {
  const { isOfflineEmpty } = require('../offlineState');
  it('is true only when waiting for a connection with nothing saved', () => {
    expect(isOfflineEmpty({ fetchStatus: 'paused', data: undefined })).toBe(true);
    expect(isOfflineEmpty({ fetchStatus: 'paused', data: [] })).toBe(false); // saved, just empty
    expect(isOfflineEmpty({ fetchStatus: 'idle', data: undefined })).toBe(false);
    expect(isOfflineEmpty({ fetchStatus: 'fetching', data: undefined })).toBe(false);
  });
});

describe('offlineBannerText', () => {
  const { offlineBannerText } = require('../offlineState');
  it('tells signed-out and setup screens that they need a connection (nothing is saved there)', () => {
    expect(offlineBannerText('(auth)')).toBe('You need a connection to sign in');
    expect(offlineBannerText('profile-setup')).toBe('You need a connection to finish setting up');
  });
  it('everywhere else, says saved data is being shown', () => {
    expect(offlineBannerText('(tabs)')).toBe("You're offline. Showing saved data.");
    expect(offlineBannerText(undefined)).toBe("You're offline. Showing saved data.");
  });
});

describe('requireOnline', () => {
  const { requireOnline } = require('../offlineState');
  it('offline: refuses and says what needs a connection', () => {
    const notify = jest.fn();
    expect(requireOnline('delete this group', false, notify)).toBe(false);
    expect(notify).toHaveBeenCalledWith("You're offline. Connect to the internet to delete this group.");
  });
  it('online: allows it silently', () => {
    const notify = jest.fn();
    expect(requireOnline('delete this group', true, notify)).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });
});

import { pickBrowserPackage } from '../googleSignIn';

describe('pickBrowserPackage', () => {
  it('returns Chrome when it is listed, even if another browser is preferred', () => {
    expect(
      pickBrowserPackage({
        browserPackages: ['org.mozilla.firefox', 'com.android.chrome'],
        preferredBrowserPackage: 'org.mozilla.firefox',
      }),
    ).toBe('com.android.chrome');
  });

  it('returns the preferred browser when Chrome is missing', () => {
    expect(
      pickBrowserPackage({ browserPackages: ['org.mozilla.firefox'], preferredBrowserPackage: 'org.mozilla.firefox' }),
    ).toBe('org.mozilla.firefox');
  });

  it('returns undefined when nothing supports Custom Tabs', () => {
    expect(pickBrowserPackage({ browserPackages: [] })).toBeUndefined();
  });
});

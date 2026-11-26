// Share sheet preview: which image goes with a share, and that sharing never waits on or fails
// because of it. The native module, file system and asset loader are mocked.

const mockShareWithPreview = jest.fn(async (_opts: any) => 'shared');
jest.mock('@/modules/rich-share', () => ({ shareWithPreview: (opts: any) => mockShareWithPreview(opts) }));

const mockFiles = new Map<string, boolean>(); // uri -> exists
let mockDownload: jest.Mock;
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: any[]) { this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'); }
    get exists() { return true; }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: any[]) { this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/'); }
    get exists() { return mockFiles.get(this.uri) === true; }
    delete() { mockFiles.delete(this.uri); }
    static downloadFileAsync(url: string, dest: any) { return mockDownload(url, dest); }
  }
  return { File, Directory, Paths: { cache: { uri: 'file:///cache' } } };
});

let mockLogoUri: string | null = 'file:///cache/logo.png';
let mockLogoFails = false;
jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: () => ({
      localUri: null as string | null,
      async downloadAsync() {
        if (mockLogoFails) throw new Error('no asset');
        this.localUri = mockLogoUri;
        return this;
      },
    }),
  },
}));

import { shareTitle, previewImageFor, shareInvite, shareApp, APP_SHARE_MESSAGE, SHARE_IMAGE_TIMEOUT_MS } from '../shareInvite';

const PHOTO = 'https://dtvnalpytbyonvnpoojw.supabase.co/storage/v1/object/public/group-images/group-1/cover.jpg?t=1';

beforeEach(() => {
  mockFiles.clear();
  mockShareWithPreview.mockClear();
  mockLogoUri = 'file:///cache/logo.png';
  mockLogoFails = false;
  mockDownload = jest.fn(async (_url: string, dest: any) => { mockFiles.set(dest.uri, true); return dest; });
  jest.useRealTimers();
});

describe('shareTitle', () => {
  it('names the group, the meetup, or the app', () => {
    expect(shareTitle({ groupName: 'Hikers' })).toBe('Join Hikers on GroupThat');
    expect(shareTitle({ groupName: 'Hikers', meetupName: 'Sat Hike' })).toBe('Join Sat Hike on GroupThat');
    expect(shareTitle({})).toBe('GroupThat');
  });
});

describe('previewImageFor', () => {
  it('downloads the group photo into share-previews once, then reuses it', async () => {
    const first = await previewImageFor(PHOTO);
    expect(first).toMatch(/^file:\/\/\/cache\/share-previews\/[a-z0-9]+\.jpg$/);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    const again = await previewImageFor(PHOTO);
    expect(again).toBe(first);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('uses the logo without downloading when there is no usable photo', async () => {
    for (const url of ['', null, undefined, 'http://insecure.example/x.jpg', 'not a url']) {
      expect(await previewImageFor(url as any)).toBe('file:///cache/logo.png');
    }
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('uses the logo when the download fails', async () => {
    mockDownload = jest.fn(async () => { throw new Error('offline'); });
    expect(await previewImageFor(PHOTO)).toBe('file:///cache/logo.png');
  });

  it(`uses the logo when the download takes longer than ${SHARE_IMAGE_TIMEOUT_MS} ms`, async () => {
    expect(SHARE_IMAGE_TIMEOUT_MS).toBe(1500);
    jest.useFakeTimers();
    mockDownload = jest.fn(() => new Promise(() => {})); // never finishes
    const slow = PHOTO.replace('group-1', 'group-slow');
    const pending = previewImageFor(slow);
    jest.advanceTimersByTime(1500);
    await expect(pending).resolves.toBe('file:///cache/logo.png');
  });

  it('retries a download that got stuck instead of waiting on it forever', async () => {
    jest.useFakeTimers();
    const stuck = PHOTO.replace('group-1', 'group-stuck');
    mockDownload = jest.fn(() => new Promise(() => {}));
    const first = previewImageFor(stuck);
    jest.advanceTimersByTime(1500);
    await first;
    // Within 10 s the same download is reused...
    const second = previewImageFor(stuck);
    jest.advanceTimersByTime(1500);
    await second;
    expect(mockDownload).toHaveBeenCalledTimes(1);
    // ...after that it is started again.
    jest.advanceTimersByTime(10_000);
    mockDownload = jest.fn(async (_url: string, dest: any) => { mockFiles.set(dest.uri, true); return dest; });
    await expect(previewImageFor(stuck)).resolves.toMatch(/share-previews/);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('returns null when even the logo cannot be loaded or is not a local file', async () => {
    mockLogoFails = true;
    expect(await previewImageFor(null)).toBeNull();
    mockLogoFails = false;
    mockLogoUri = 'asset:/icon.png';
    expect(await previewImageFor(null)).toBeNull();
  });
});

describe('shareInvite / shareApp', () => {
  it('shares the exact message with the title and the chosen image', async () => {
    await shareInvite({ message: 'MSG', groupName: 'Hikers', imageUrl: PHOTO });
    const opts = mockShareWithPreview.mock.calls[0][0];
    expect(opts.message).toBe('MSG');
    expect(opts.title).toBe('Join Hikers on GroupThat');
    expect(opts.imageUri).toMatch(/share-previews/);
  });

  it('still shares when no image can be found', async () => {
    mockLogoFails = true;
    await shareInvite({ message: 'MSG', groupName: 'Hikers', imageUrl: '' });
    expect(mockShareWithPreview).toHaveBeenCalledWith({ message: 'MSG', title: 'Join Hikers on GroupThat', imageUri: null });
  });

  it('app share: one message with the single link, logo, title GroupThat', async () => {
    expect(APP_SHARE_MESSAGE).toBe('Join me on GroupThat! The easiest way to coordinate meetups with your group.\n\n👉 https://invite.groupthatapp.com/download');
    await shareApp();
    expect(mockShareWithPreview).toHaveBeenCalledWith({ message: APP_SHARE_MESSAGE, title: 'GroupThat', imageUri: 'file:///cache/logo.png' });
  });
});

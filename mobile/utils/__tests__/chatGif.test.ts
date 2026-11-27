import { isGifUrl, isGifAsset, mediaLabel, MAX_GIF_BYTES } from '../chatGif';

describe('isGifUrl', () => {
  it('ignores the query string', () => {
    expect(isGifUrl('https://x/chat/g/c.gif?t=123')).toBe(true);
  });
  it('is case-insensitive', () => {
    expect(isGifUrl('https://x/chat/g/c.GIF')).toBe(true);
  });
  it('is false for photos and missing urls', () => {
    expect(isGifUrl('https://x/chat/g/c.jpg?t=1')).toBe(false);
    expect(isGifUrl('https://x/chat/g/gif.jpg')).toBe(false);
    expect(isGifUrl(null)).toBe(false);
    expect(isGifUrl(undefined)).toBe(false);
  });
});

describe('isGifAsset', () => {
  it('trusts the mime type', () => {
    expect(isGifAsset({ mimeType: 'image/gif', uri: 'file:///a' })).toBe(true);
  });
  it('recognises a .gif file name with no mime type', () => {
    expect(isGifAsset({ fileName: 'Funny.GIF', uri: 'content://x' })).toBe(true);
    expect(isGifAsset({ uri: 'file:///cache/a.gif' })).toBe(true);
  });
  it('is false for photos', () => {
    expect(isGifAsset({ mimeType: 'image/jpeg', fileName: 'a.jpg', uri: 'file:///a.jpg' })).toBe(false);
  });
});

describe('mediaLabel', () => {
  it('says GIF for a GIF and Photo otherwise', () => {
    expect(mediaLabel('https://x/c.gif?t=1')).toBe('GIF');
    expect(mediaLabel('https://x/c.jpg')).toBe('📷 Photo');
  });
});

it('caps GIFs at 8 MB', () => {
  expect(MAX_GIF_BYTES).toBe(8 * 1024 * 1024);
});

describe('classifyPicked', () => {
  const { classifyPicked } = require('../chatGif');
  const MB = 1024 * 1024;
  const noSize = () => 0;

  it('turns away a GIF over 8 MB', () => {
    const r = classifyPicked([{ uri: 'file:///big.gif', mimeType: 'image/gif', fileSize: 9 * MB, width: 1, height: 1 }], noSize);
    expect(r).toEqual({ accepted: [], tooLarge: 1 });
  });

  it('accepts a GIF under the cap, flagged as a GIF', () => {
    const r = classifyPicked([{ uri: 'file:///ok.gif', mimeType: 'image/gif', fileSize: 3 * MB, width: 320, height: 240 }], noSize);
    expect(r).toEqual({ accepted: [{ uri: 'file:///ok.gif', width: 320, height: 240, isGif: true }], tooLarge: 0 });
  });

  it('accepts a big photo (photos are compressed before upload)', () => {
    const r = classifyPicked([{ uri: 'file:///p.jpg', mimeType: 'image/jpeg', fileSize: 20 * MB, width: 4000, height: 3000 }], noSize);
    expect(r.tooLarge).toBe(0);
    expect(r.accepted[0]).toMatchObject({ uri: 'file:///p.jpg', isGif: false });
  });

  it("falls back to the file's size when the picker leaves fileSize out", () => {
    const sizeOf = jest.fn(() => 9 * MB);
    const r = classifyPicked([{ uri: 'file:///x.gif', mimeType: 'image/gif' }], sizeOf);
    expect(sizeOf).toHaveBeenCalledWith('file:///x.gif');
    expect(r.tooLarge).toBe(1);
  });

  it("never measures a photo's file", () => {
    const sizeOf = jest.fn(() => 0);
    classifyPicked([{ uri: 'file:///p.jpg', mimeType: 'image/jpeg' }], sizeOf);
    expect(sizeOf).not.toHaveBeenCalled();
  });
});

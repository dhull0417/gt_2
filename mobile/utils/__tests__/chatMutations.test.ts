const mockUploadGif = jest.fn(async (..._a: any[]) => ({ url: 'https://x/c1.gif?t=1', width: 10, height: 20 }));
const mockUploadPhoto = jest.fn(async (..._a: any[]) => ({ url: 'https://x/c1.jpg?t=1', width: 1280, height: 960 }));
jest.mock('@/utils/uploadImage', () => ({
  uploadChatGif: (...a: any[]) => mockUploadGif(...a),
  uploadImageFromUriWithDimensions: (...a: any[]) => mockUploadPhoto(...a),
}));

import { buildSendRpcArgs, chatPhotoPath, uploadQueuedImage } from '../chatMutations';

const base = {
  clientId: 'c1', groupId: 'g1', senderId: 'u1', senderName: 'Sam', content: 'hi', createdAt: '2026-11-11T00:00:00Z',
};

describe('buildSendRpcArgs', () => {
  it('sends text with no photo', () => {
    const args = buildSendRpcArgs(base);
    expect(args).toMatchObject({ p_client_id: 'c1', p_group_id: 'g1', p_content: 'hi', p_image_url: null });
    expect(args).not.toHaveProperty('p_mentions');
  });

  it('uses the uploaded URL for a photo picked offline (queued with only its local file)', () => {
    const args = buildSendRpcArgs(
      { ...base, image: { localUri: 'file:///p.jpg', width: 10, height: 20 } },
      { url: 'https://x/p.jpg', width: 1280, height: 2560 },
    );
    expect(args).toMatchObject({ p_image_url: 'https://x/p.jpg', p_image_width: 1280, p_image_height: 2560 });
  });

  it('still honours a send saved by the previous app version (already-uploaded url)', () => {
    const args = buildSendRpcArgs({ ...base, image: { url: 'https://x/old.jpg', width: 5, height: 6 } });
    expect(args).toMatchObject({ p_image_url: 'https://x/old.jpg', p_image_width: 5, p_image_height: 6 });
  });

  it('includes mentions only when there are some', () => {
    expect(buildSendRpcArgs({ ...base, mentions: ['u2'] })).toMatchObject({ p_mentions: ['u2'] });
    expect(buildSendRpcArgs({ ...base, mentions: [] })).not.toHaveProperty('p_mentions');
  });
});

describe('chatPhotoPath', () => {
  it('names the file after the message, so a retried upload overwrites instead of duplicating', () => {
    expect(chatPhotoPath('g1', 'c1')).toBe('chat/g1/c1.jpg');
  });
  it('names a GIF .gif', () => {
    expect(chatPhotoPath('g1', 'c1', true)).toBe('chat/g1/c1.gif');
  });
});

describe('uploadQueuedImage', () => {
  beforeEach(() => { mockUploadGif.mockClear(); mockUploadPhoto.mockClear(); });

  it('queued GIF keeps its .gif path', async () => {
    const res = await uploadQueuedImage({ ...base, image: { localUri: 'file:///a', isGif: true, width: 10, height: 20 } }, 'tok');
    expect(mockUploadGif).toHaveBeenCalledWith('file:///a', 'chat/g1/c1.gif', 'tok', { width: 10, height: 20 });
    expect(mockUploadPhoto).not.toHaveBeenCalled();
    expect(res?.url).toBe('https://x/c1.gif?t=1');
  });

  it('an old queued photo without isGif still uploads as .jpg', async () => {
    await uploadQueuedImage({ ...base, image: { localUri: 'file:///p' } }, 'tok');
    expect(mockUploadPhoto).toHaveBeenCalledWith('file:///p', 'chat-images', 'chat/g1/c1.jpg', 'tok');
    expect(mockUploadGif).not.toHaveBeenCalled();
  });

  it('does nothing for an already-uploaded picture or a text-only send', async () => {
    expect(await uploadQueuedImage({ ...base, image: { url: 'https://x/old.jpg' } }, 'tok')).toBeUndefined();
    expect(await uploadQueuedImage(base, 'tok')).toBeUndefined();
    expect(mockUploadGif).not.toHaveBeenCalled();
    expect(mockUploadPhoto).not.toHaveBeenCalled();
  });
});

describe('sendRetry', () => {
  const { sendRetry } = require('../chatMutations');
  it('never retries a send the database refused because the sender is timed out', () => {
    expect(sendRetry(0, { message: 'timed out' })).toBe(false);
  });
  it('still retries network trouble up to the limit', () => {
    expect(sendRetry(0, new Error('Network request failed'))).toBe(true);
    expect(sendRetry(5, new Error('Network request failed'))).toBe(true);
    expect(sendRetry(6, new Error('Network request failed'))).toBe(false);
  });
});

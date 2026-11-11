import { buildSendRpcArgs, chatPhotoPath } from '../chatMutations';

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
});

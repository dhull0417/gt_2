import { nextJumpStep } from '../chatJump';

const msgs = (...ids: string[]) => ids.map((id) => ({ id, deleted_at: null as string | null }));

describe('nextJumpStep', () => {
  it('is found once the message is loaded', () => {
    expect(nextJumpStep({ messages: msgs('a', 'b'), targetId: 'b', pagesLoaded: 0, reachedStart: false })).toBe('found');
  });

  it('loads more history while the message is missing and under the cap', () => {
    expect(nextJumpStep({ messages: msgs('a'), targetId: 'z', pagesLoaded: 0, reachedStart: false })).toBe('loadMore');
    expect(nextJumpStep({ messages: msgs('a'), targetId: 'z', pagesLoaded: 19, reachedStart: false })).toBe('loadMore');
  });

  it('gives up after 20 pages', () => {
    expect(nextJumpStep({ messages: msgs('a'), targetId: 'z', pagesLoaded: 20, reachedStart: false })).toBe('tooFar');
  });

  it('is not found once the start of the conversation is loaded without it', () => {
    expect(nextJumpStep({ messages: msgs('a'), targetId: 'z', pagesLoaded: 3, reachedStart: true })).toBe('notFound');
  });

  it('still finds a deleted message (the bubble says it was deleted)', () => {
    const list = [{ id: 'd', deleted_at: '2026-11-01T00:00:00Z' }];
    expect(nextJumpStep({ messages: list, targetId: 'd', pagesLoaded: 0, reachedStart: false })).toBe('found');
  });
});

describe('jump requests', () => {
  it('hands a jump to the chat once, for the right group only', () => {
    const { requestJump, takeJumpRequest } = require('../chatJump');
    requestJump('g1', 'm1');
    expect(takeJumpRequest('g2')).toBeNull();
    expect(takeJumpRequest('g1')).toBe('m1');
    expect(takeJumpRequest('g1')).toBeNull();
  });
});

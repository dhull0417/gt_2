import { nextJumpStep, findMessageLocation, shouldLoadOlderOnScroll } from '../chatJump';

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

describe('findMessageLocation', () => {
  const sec = (key: string, ...ids: string[]) => ({ key, data: ids.map((id) => ({ id })) });

  it('finds the section and row of a message', () => {
    expect(findMessageLocation([sec('d1', 'a', 'b'), sec('d2', 'c', 'd')], 'd')).toEqual({ sectionIndex: 1, itemIndex: 1 });
  });

  it('follows the message when an older page is added above it (no stale position)', () => {
    const before = [sec('d2', 'c', 'target')];
    const after = [sec('d0', 'x', 'y'), sec('d1', 'z'), sec('d2', 'w', 'c', 'target')];
    expect(findMessageLocation(before, 'target')).toEqual({ sectionIndex: 0, itemIndex: 1 });
    expect(findMessageLocation(after, 'target')).toEqual({ sectionIndex: 2, itemIndex: 2 });
  });

  it('is null when the message is not loaded', () => {
    expect(findMessageLocation([sec('d1', 'a')], 'zz')).toBeNull();
  });
});

describe('shouldLoadOlderOnScroll', () => {
  it('loads older history when scrolled near the top', () => {
    expect(shouldLoadOlderOnScroll({ offsetY: 100, contentReady: true, jumping: false })).toBe(true);
  });

  it('does not load while far from the top or before the list is shown', () => {
    expect(shouldLoadOlderOnScroll({ offsetY: 900, contentReady: true, jumping: false })).toBe(false);
    expect(shouldLoadOlderOnScroll({ offsetY: 100, contentReady: false, jumping: false })).toBe(false);
  });

  it('does not load mid-jump: a page added above would knock the scroll off its target', () => {
    expect(shouldLoadOlderOnScroll({ offsetY: 100, contentReady: true, jumping: true })).toBe(false);
  });
});

import { chatLoadState } from '../chatLoadState';

describe('chatLoadState', () => {
  it('is ready once the group, your profile and the messages are all there', () => {
    expect(chatLoadState({ hasGroup: true, hasUser: true, messagesReady: true, elapsedMs: 50 }))
      .toEqual({ state: 'ready', missing: [] });
  });

  it('keeps loading until the 8 second limit', () => {
    expect(chatLoadState({ hasGroup: false, hasUser: true, messagesReady: true, elapsedMs: 7999 }).state).toBe('loading');
  });

  it('fails at 8 seconds and says what was missing', () => {
    expect(chatLoadState({ hasGroup: false, hasUser: true, messagesReady: true, elapsedMs: 8000 }))
      .toEqual({ state: 'failed', missing: ['group'] });
    expect(chatLoadState({ hasGroup: false, hasUser: false, messagesReady: false, elapsedMs: 9000 }).missing)
      .toEqual(['group', 'your profile', 'messages']);
  });

  it('becomes ready even after failing once everything arrives', () => {
    expect(chatLoadState({ hasGroup: true, hasUser: true, messagesReady: true, elapsedMs: 20000 }).state).toBe('ready');
  });
});

describe('chatLoadState offline', () => {
  it('says offline right away when messages are waiting for a connection and none are saved', () => {
    expect(chatLoadState({ hasGroup: true, hasUser: true, messagesReady: false, messagesPaused: true, elapsedMs: 0 }).state).toBe('offline');
  });
  it('shows saved messages normally while offline', () => {
    expect(chatLoadState({ hasGroup: true, hasUser: true, messagesReady: true, messagesPaused: true, elapsedMs: 0 }).state).toBe('ready');
  });
});

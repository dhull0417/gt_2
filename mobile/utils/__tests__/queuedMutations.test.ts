import { MutationCache, QueryClient, onlineManager } from '@tanstack/react-query';
import { QUEUED_KEYS, isQueuedKey } from '../queuedMutations';
import { registerOfflineMutationDefaults } from '../offlineMutations';
import { QUERY_CLIENT_DEFAULT_OPTIONS } from '../queryClientOptions';

// The app's own defaults: ordinary mutations send immediately (and so fail offline),
// queued ones pause until the connection is back.
function makeClient() {
  return new QueryClient({ defaultOptions: QUERY_CLIENT_DEFAULT_OPTIONS, mutationCache: new MutationCache() });
}

const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const settle = (p: Promise<unknown>, ms = 200) =>
  Promise.race([p.then(() => 'settled', () => 'settled'), new Promise((r) => setTimeout(() => r('hanging'), ms))]);

describe('mutation network modes', () => {
  beforeEach(() => onlineManager.setOnline(false));
  afterEach(() => onlineManager.setOnline(true));

  it('lists the queued keys', () => {
    expect(QUEUED_KEYS).toEqual(['sendMessage', 'rsvp', 'acceptInvite', 'declineInvite', 'votePoll', 'toggleReaction', 'markGroupRead']);
    expect(isQueuedKey('rsvp')).toBe(true);
    expect(isQueuedKey('deleteGroup')).toBe(false);
  });

  it('an ordinary mutation fails right away offline instead of pausing', async () => {
    const client = makeClient();
    const m = client.getMutationCache().build(client, { mutationFn: async () => { throw networkError; } });
    const outcome = await settle(m.execute(undefined));
    expect(outcome).toBe('settled');
    expect(m.state.isPaused).toBe(false);
    expect(m.state.status).toBe('error');
  });

  it('a queued mutation (rsvp) pauses offline', async () => {
    const client = makeClient();
    registerOfflineMutationDefaults(client);
    const m = client.getMutationCache().build(client, { mutationKey: ['rsvp'] });
    const outcome = await settle(m.execute({ meetupId: 'm1', status: 'in' }));
    expect(outcome).toBe('hanging');
    expect(m.state.isPaused).toBe(true);
  });
});

describe('scopeFor', () => {
  it('scopes each queued action to the thing it changes', () => {
    const { scopeFor } = require('../queuedMutations');
    expect(scopeFor('sendMessage', { groupId: 'g1' })).toBe('chat:g1');
    expect(scopeFor('rsvp', { meetupId: 'm1' })).toBe('rsvp:m1');
    expect(scopeFor('acceptInvite', 'n1')).toBe('invite:n1');
    expect(scopeFor('declineInvite', 'n1')).toBe('invite:n1');
    expect(scopeFor('votePoll', { pollId: 'p1' })).toBe('poll:p1');
    expect(scopeFor('toggleReaction', { messageId: 'x1' })).toBe('reaction:x1');
    expect(scopeFor('markGroupRead', { groupId: 'g1' })).toBe('read:g1');
  });
});

describe('queueMutation', () => {
  beforeEach(() => onlineManager.setOnline(false));
  afterEach(() => onlineManager.setOnline(true));

  const queued = (client: QueryClient) =>
    client.getMutationCache().getAll().map((m) => ({
      scope: m.options.scope?.id,
      vars: m.state.variables,
      paused: m.state.isPaused,
    }));

  it('pauses offline and carries the scope', async () => {
    const { queueMutation } = require('../queuedMutations');
    const client = makeClient();
    registerOfflineMutationDefaults(client);
    queueMutation(client, 'rsvp', { meetupId: 'm1', status: 'in' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(queued(client)).toEqual([{ scope: 'rsvp:m1', vars: { meetupId: 'm1', status: 'in' }, paused: true }]);
  });

  it('keeps only the latest RSVP per meetup, and leaves other meetups alone', async () => {
    const { queueMutation } = require('../queuedMutations');
    const client = makeClient();
    registerOfflineMutationDefaults(client);
    queueMutation(client, 'rsvp', { meetupId: 'm1', status: 'in' }).catch(() => {});
    queueMutation(client, 'rsvp', { meetupId: 'm2', status: 'in' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    queueMutation(client, 'rsvp', { meetupId: 'm1', status: 'out' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(queued(client).map((q) => q.vars)).toEqual([
      { meetupId: 'm2', status: 'in' },
      { meetupId: 'm1', status: 'out' },
    ]);
  });

  it('never drops a queued chat message', async () => {
    const { queueMutation } = require('../queuedMutations');
    const { registerChatMutationDefaults } = require('../chatMutations');
    const client = makeClient();
    registerChatMutationDefaults(client);
    queueMutation(client, 'sendMessage', { groupId: 'g1', clientId: 'a' }).catch(() => {});
    queueMutation(client, 'sendMessage', { groupId: 'g1', clientId: 'b' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(queued(client).map((q) => (q.vars as any).clientId)).toEqual(['a', 'b']);
  });
});

describe('resumeQueued', () => {
  afterEach(() => onlineManager.setOnline(true));

  // What the persister hands back after an app restart.
  const restored = (status: 'pending', isPaused: boolean, variables: unknown, key = 'rsvp') => ({
    mutationKey: [key],
    scope: { id: `rsvp:${(variables as any).meetupId}` },
    state: {
      context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null,
      isPaused, status, variables, submittedAt: 1,
    },
  });

  it('sends both kinds of restored work: paused offline, and mid-flight when the app was killed', async () => {
    const { hydrate } = require('@tanstack/react-query');
    const { resumeQueued } = require('../queuedMutations');
    const client = makeClient();
    const sent: string[] = [];
    client.setMutationDefaults(['rsvp'], {
      networkMode: 'online',
      mutationFn: async (v: any) => { sent.push(v.meetupId); return {}; },
    });
    hydrate(client, { mutations: [restored('pending', true, { meetupId: 'paused' }), restored('pending', false, { meetupId: 'inflight' })], queries: [] });
    onlineManager.setOnline(true);
    await resumeQueued(client);
    expect(sent.sort()).toEqual(['inflight', 'paused']);
  });

  it('leaves ordinary (non-queued) mutations alone', async () => {
    const { hydrate } = require('@tanstack/react-query');
    const { resumeQueued } = require('../queuedMutations');
    const client = makeClient();
    const fn = jest.fn(async () => ({}));
    client.setMutationDefaults(['deleteGroup'], { mutationFn: fn });
    hydrate(client, { mutations: [restored('pending', false, { meetupId: 'x' }, 'deleteGroup')], queries: [] });
    await resumeQueued(client);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('queuedErrorMessage', () => {
  const { queuedErrorMessage } = require('../queuedMutations');
  const serverSays = (msg: string) => ({ response: { status: 400, data: { error: msg } } });

  it("shows the server's reason when there is one", () => {
    expect(queuedErrorMessage('rsvp', serverSays('The RSVP deadline has passed.'))).toBe("Couldn't send your RSVP: The RSVP deadline has passed.");
  });
  it('falls back to a plain message per action', () => {
    expect(queuedErrorMessage('rsvp', new Error('x'))).toBe("Couldn't send your RSVP.");
    expect(queuedErrorMessage('votePoll', new Error('x'))).toBe("Couldn't send your vote.");
    expect(queuedErrorMessage('toggleReaction', new Error('x'))).toBe("Couldn't save your reaction.");
    expect(queuedErrorMessage('acceptInvite', new Error('x'))).toBe("Couldn't answer the invitation.");
  });
  it('stays quiet for messages (their bubble shows Retry) and read marks', () => {
    expect(queuedErrorMessage('sendMessage', new Error('x'))).toBeNull();
    expect(queuedErrorMessage('markGroupRead', new Error('x'))).toBeNull();
  });
});

describe('resumeQueued and reactions', () => {
  afterEach(() => onlineManager.setOnline(true));

  it("does not re-send a reaction that was mid-request when the app was killed (it's a toggle), and refreshes that chat instead", async () => {
    const { hydrate } = require('@tanstack/react-query');
    const { resumeQueued } = require('../queuedMutations');
    const client = makeClient();
    const fn = jest.fn(async () => ({}));
    client.setMutationDefaults(['toggleReaction'], { networkMode: 'online', mutationFn: fn });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    hydrate(client, { queries: [], mutations: [{
      mutationKey: ['toggleReaction'], scope: { id: 'reaction:x' },
      state: { context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null, isPaused: false, status: 'pending', variables: { messageId: 'x', groupId: 'g1', emoji: '👍' }, submittedAt: 1 },
    }] });
    await resumeQueued(client);
    expect(fn).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages', 'g1'] });
  });
});

describe('review fixes', () => {
  afterEach(() => onlineManager.setOnline(true));

  it("an organizer's offline overrides for two different people are both kept", async () => {
    const { queueMutation, scopeFor } = require('../queuedMutations');
    expect(scopeFor('rsvp', { meetupId: 'm1', targetUserId: 'a' })).toBe('rsvp:m1:a');
    expect(scopeFor('rsvp', { meetupId: 'm1' })).toBe('rsvp:m1');
    onlineManager.setOnline(false);
    const client = makeClient();
    registerOfflineMutationDefaults(client);
    queueMutation(client, 'rsvp', { meetupId: 'm1', status: 'in', targetUserId: 'a' }).catch(() => {});
    queueMutation(client, 'rsvp', { meetupId: 'm1', status: 'out', targetUserId: 'b' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(client.getMutationCache().getAll()).toHaveLength(2);
  });

  it('keeps retrying while sign-in is still loading, but gives up quickly on real errors', () => {
    const { queuedRetry, NoTokenError } = require('../queuedMutations');
    expect(queuedRetry(10, new NoTokenError())).toBe(true);
    expect(queuedRetry(30, new NoTokenError())).toBe(false);
    expect(queuedRetry(1, new Error('500'))).toBe(true);
    expect(queuedRetry(2, new Error('500'))).toBe(false);
  });

  it('a failed message keeps its Retry bubble (never garbage-collected)', () => {
    const { registerChatMutationDefaults } = require('../chatMutations');
    const client = makeClient();
    registerChatMutationDefaults(client);
    const m = client.getMutationCache().build(client, { mutationKey: ['sendMessage'] });
    expect(m.options.gcTime).toBe(Infinity);
  });

  it('on reconnect, a reaction that is mid-request in this session is left alone', async () => {
    const { hydrate } = require('@tanstack/react-query');
    const { resumeQueued } = require('../queuedMutations');
    const client = makeClient();
    client.setMutationDefaults(['toggleReaction'], { networkMode: 'online', mutationFn: async () => ({}) });
    hydrate(client, { queries: [], mutations: [{
      mutationKey: ['toggleReaction'], scope: { id: 'reaction:x' },
      state: { context: undefined, data: undefined, error: null, failureCount: 0, failureReason: null, isPaused: false, status: 'pending', variables: { messageId: 'x', groupId: 'g1', emoji: '👍' }, submittedAt: 1 },
    }] });
    await resumeQueued(client, { afterRestore: false });
    expect(client.getMutationCache().getAll()).toHaveLength(1);
  });

  it('after a failed queued action, says which list to reload (a reaction reloads its chat)', () => {
    const { queuedErrorRefreshKey } = require('../queuedMutations');
    expect(queuedErrorRefreshKey('toggleReaction', { groupId: 'g1' })).toEqual(['messages', 'g1']);
    expect(queuedErrorRefreshKey('rsvp', { meetupId: 'm' })).toEqual(['meetups']);
    expect(queuedErrorRefreshKey('votePoll', { groupId: 'g1' })).toEqual(['polls', 'g1']);
    expect(queuedErrorRefreshKey('acceptInvite', 'n1')).toEqual(['notifications']);
    expect(queuedErrorRefreshKey('sendMessage', { groupId: 'g1' })).toBeNull();
  });
});

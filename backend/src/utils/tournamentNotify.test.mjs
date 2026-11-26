import test from 'node:test';
import assert from 'node:assert/strict';
import { tournamentPushes } from './tournamentNotify.js';

const P = (user) => ({ key: user, user, guestOf: null, guestIndex: null });
const G = (host, n) => ({ key: `guest:${host}:${n}`, user: null, guestOf: host, guestIndex: n });
const names = { a: 'Ana', b: 'Ben', c: 'Cy', d: 'Dee' };
const hosts = { cA: 'Ana' };
const teamsEvent = {
  mode: 'teams', format: 'single',
  teams: [{ key: 't1', name: 'Reds', players: [P('a'), G('cA', 1)] }, { key: 't2', name: 'Blues', players: [P('b'), P('c')] }],
  matches: [{ id: 'm1', status: 'ready', slots: [{ team: 't1' }, { team: 't2' }] }],
  champion: null,
};
const singles = {
  mode: 'singles', format: 'single',
  teams: ['a', 'b', 'c', 'd'].map((u, i) => ({ key: `t${i + 1}`, name: null, players: [P(u)] })),
  matches: [
    { id: 'm1', status: 'ready', slots: [{ team: 't1' }, { team: 't4' }] },
    { id: 'm2', status: 'ready', slots: [{ team: 't2' }, { team: 't3' }] },
    { id: 'm3', status: 'waiting', slots: [{ team: null }, { team: null }] },
  ],
  champion: 't3',
};
const ctx = { groupName: 'Pickleball', names, hosts };

test('teams set: one push per team, to user players only', () => {
  const p = tournamentPushes('set', { ...ctx, tournament: teamsEvent });
  assert.deepEqual(p, [
    { to: ['a'], title: 'Pickleball: teams are set', body: "You're on Reds. First up: Blues" },
    { to: ['b', 'c'], title: 'Pickleball: teams are set', body: "You're on Blues. First up: Reds" },
  ]);
});

test('singles set names the first opponent', () => {
  const p = tournamentPushes('set', { ...ctx, tournament: singles });
  assert.deepEqual(p[0], { to: ['a'], title: 'Pickleball: the matches are set', body: 'First up: Dee' });
});

test('just teams has no "first up"', () => {
  const p = tournamentPushes('set', { ...ctx, tournament: { ...teamsEvent, format: 'none', matches: [] } });
  assert.equal(p[0].body, "You're on Reds");
});

test('match ready goes only to that match, never for byes or unknown ids', () => {
  const t = { ...singles, matches: [...singles.matches, { id: 'm4', status: 'bye', slots: [{ team: 't1' }] }] };
  const p = tournamentPushes('ready', { ...ctx, tournament: t, newlyReady: ['m2', 'm4', 'zz'] });
  assert.deepEqual(p, [{ to: ['b', 'c'], title: "Pickleball: you're up", body: 'Ben vs Cy' }]);
});

test('finished announces the champion to everyone playing', () => {
  const p = tournamentPushes('finished', { ...ctx, tournament: singles });
  assert.deepEqual(p, [{ to: ['a', 'b', 'c', 'd'], title: 'Pickleball: we have a champion', body: 'Cy won!' }]);
});

test('guest labels and missing names fall back sensibly', () => {
  const t = { mode: 'singles', format: 'single', teams: [{ key: 't1', name: null, players: [G('cA', 2)] }, { key: 't2', name: null, players: [P('zz')] }],
    matches: [{ id: 'm1', status: 'ready', slots: [{ team: 't1' }, { team: 't2' }] }], champion: 't1' };
  assert.equal(tournamentPushes('finished', { ...ctx, tournament: t })[0].body, "Ana's guest 2 won!");
  assert.equal(tournamentPushes('ready', { ...ctx, tournament: t, newlyReady: ['m1'] })[0].body, "Ana's guest 2 vs Player");
});

import { describe, expect, it } from 'vitest';
import { moneyRanking } from './stats';
import type { Match, MatchEvent, Player } from './types';

let seq = 0;
const join = (playerId: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at: '', playerId, points });
const round = (winnerId: string): MatchEvent => ({ type: 'round', id: `e${seq++}`, at: '', winnerId, fled: [] });
const pact = (...playerIds: string[]): MatchEvent => ({ type: 'pact', id: `e${seq++}`, at: '', playerIds });
const split = (a: number, b: number): MatchEvent => ({ type: 'split', id: `e${seq++}`, at: '', shares: [{ playerId: 'a', cents: a }, { playerId: 'b', cents: b }] });
const player = (id: string): Player => ({ id, name: id.toUpperCase(), createdAt: '' });
const match = (id: string, ...events: MatchEvent[]): Match => ({ id, createdAt: '', finishedAt: 'x', stakeCents: 1000, events });

describe('ranking de dinheiro', () => {
  const players = ['a', 'b', 'c'].map(player);
  const matches = [
    match('m1', join('a', 2), join('b', 2), join('c', 2), round('a')), // a +2000, b -1000, c -1000
    match('m2', join('a', 2), join('b', 2), join('c', 2), pact('b', 'c'), round('b')), // b +1000, c 0, a -1000
    match('m3', join('a', 3), join('b', 3), join('c', 1), round('a'), split(2000, 1000)), // a +1000, b 0, c -1000
    { ...match('m4', join('a', 2), join('b', 2), round('a')), stakeCents: undefined }, // sem valor casado: não conta
  ];

  it('soma o lucro de cada um, descontando o que casou', () => {
    const rows = moneyRanking(players, matches);
    expect(rows.map((r) => [r.player.id, r.netCents, r.stakedCents, r.receivedCents, r.bestCents, r.matches])).toEqual([
      ['a', 2000, 3000, 5000, 2000, 3],
      ['b', 0, 3000, 3000, 1000, 3],
      ['c', -2000, 3000, 1000, 0, 3],
    ]);
  });

  it('o total de lucros e prejuízos sempre fecha em zero', () => {
    expect(moneyRanking(players, matches).reduce((s, r) => s + r.netCents, 0)).toBe(0);
  });
});

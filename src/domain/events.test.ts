import { describe, expect, it } from 'vitest';
import { closePlan, eventCash, eventIdOf, legacyEvent, openEvent } from './events';
import type { LedgerEntry } from './ledger';
import type { GameEvent, Match } from './types';

const h = (hours: number) => new Date(Date.UTC(2026, 9, 10, 12) + hours * 3600_000).toISOString();
let seq = 0;
const entry = (playerId: string, kind: LedgerEntry['kind'], amountCents: number, at: number, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: `l${seq++}`,
  at: h(at),
  playerId,
  kind,
  amountCents,
  ...extra,
});
const match = (id: string, at: number, extra: Partial<Match> = {}): Match => ({ id, createdAt: h(at), events: [], ...extra });

describe('eventos', () => {
  const e1: GameEvent = { id: 'e1', name: 'Evento 1', startedAt: h(0), endedAt: h(10) };
  const e2: GameEvent = { id: 'e2', name: 'Evento 2', startedAt: h(12) };
  const events = [e2, e1];

  it('o aberto é o que não foi encerrado; sem marcação, é do primeiro evento', () => {
    expect(openEvent(events)?.id).toBe('e2');
    expect(eventIdOf({}, events)).toBe('e1');
    expect(eventIdOf({ eventId: 'e2' }, events)).toBe('e2');
  });

  it('dados de antes dos eventos viram o Evento 1, a partir do primeiro registro', () => {
    expect(legacyEvent([match('m', 5)], [entry('a', 'deposit', 1000, 3)], 'x')).toEqual({ id: 'x', name: 'Evento 1', startedAt: h(3) });
    expect(legacyEvent([], [], 'x')).toBeUndefined();
  });

  it('caixa do evento: só os movimentos dele, nascendo do zero, com a partida de cada um', () => {
    const matches = [match('m1', 0.5, { finishedAt: h(1), paidOutAt: h(1) }), match('m2', 12.5, { eventId: 'e2' })];
    const ledger = [
      entry('a', 'deposit', 5000, 0.6, { refMatchId: 'm1' }),
      entry('a', 'stake', 1000, 0.6, { matchId: 'm1' }),
      entry('a', 'prizeCash', 1000, 1, { matchId: 'm1' }),
      entry('a', 'withdraw', 4000, 10), // encerramento do evento 1
      entry('b', 'deposit', 2000, 12.6, { eventId: 'e2', refMatchId: 'm2' }),
      entry('b', 'deposit', 1000, 13, { eventId: 'e2' }), // no caixa, durante a partida 2
    ];
    const one = eventCash(ledger, matches, events, e1);
    expect(one.moves.map((m) => [m.entry.kind, m.matchNumber, m.atStake, m.atClose, m.cashAfter])).toEqual([
      ['deposit', 1, true, false, 5000],
      ['prizeCash', 1, false, false, 4000],
      ['withdraw', undefined, false, true, 0],
    ]);
    expect([one.opening, one.cashIn, one.cashOut, one.closing]).toEqual([0, 5000, 5000, 0]);
    const two = eventCash(ledger, matches, events, e2);
    expect([two.opening, two.closing, two.matches.map((m) => m.id)]).toEqual([0, 3000, ['m2']]);
    expect(two.moves.map((m) => m.matchNumber)).toEqual([1, 1]);
  });

  it('encerrar: bloqueia com partida em andamento ou prêmio a pagar, e paga o crédito de cada um', () => {
    const ledger = [entry('a', 'deposit', 3000, 12.1, { eventId: 'e2' }), entry('b', 'deposit', 1000, 12.2, { eventId: 'e2' }), entry('b', 'withdraw', 1000, 12.3, { eventId: 'e2' })];
    const ok = closePlan(ledger, [match('m2', 12.5, { eventId: 'e2', finishedAt: h(13) })], events, e2);
    expect(ok).toEqual({ blockers: [], payouts: [{ playerId: 'a', cents: 3000 }], totalCents: 3000 });
    const staked = [...ledger, entry('a', 'stake', 1000, 13.1, { eventId: 'e2', matchId: 'm3' })];
    const busy = closePlan(staked, [match('m2', 12.5, { eventId: 'e2' }), match('m3', 13, { eventId: 'e2', finishedAt: h(14), stakeCents: 1000 })], events, e2);
    expect(busy.blockers).toEqual([
      { matchId: 'm2', number: 1, reason: 'ongoing' },
      { matchId: 'm3', number: 2, reason: 'unpaid' },
    ]);
  });

  it('partida de antes do caixa, com valor mas sem ninguém ter casado pelo app, não trava o encerramento', () => {
    const legacy = match('old', 1, { finishedAt: h(2), stakeCents: 500 });
    const plan = closePlan([], [legacy], [{ id: 'e1', name: 'Evento 1', startedAt: h(0) }], { id: 'e1', name: 'Evento 1', startedAt: h(0) });
    expect(plan.blockers).toEqual([]);
  });
});

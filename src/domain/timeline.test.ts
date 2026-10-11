import { describe, expect, it } from 'vitest';
import type { LedgerEntry } from './ledger';
import { timeline, type TimelineItem } from './timeline';
import type { Match, MatchEvent } from './types';

let seq = 0;
const t = (min: number) => new Date(Date.UTC(2026, 9, 11, 15, min)).toISOString();
const join = (playerId: string, at: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at, playerId, points });
const start = (at: string, fled: string[] = []): MatchEvent => ({ type: 'start', id: `e${seq++}`, at, fled });
const round = (at: string, winnerId: string, fled: string[] = []): MatchEvent => ({ type: 'round', id: `e${seq++}`, at, winnerId, fled });
const pact = (at: string, ...playerIds: string[]): MatchEvent => ({ type: 'pact', id: `e${seq++}`, at, playerIds });
const stake = (playerId: string, at: string): LedgerEntry => ({ id: `l${seq++}`, at, playerId, kind: 'stake', amountCents: 1000, matchId: 'm' });

describe('memória da partida', () => {
  const m: Match = {
    id: 'm',
    createdAt: t(0),
    firstDealerId: 'a',
    stakeCents: 1000,
    events: [join('a', t(0)), join('b', t(0), 3), join('c', t(0)), pact(t(2), 'a', 'c'), pact(t(3), 'b'), start(t(4), ['c']), round(t(9), 'a', ['c'])],
  };
  const items = timeline(m, [stake('a', t(1)), stake('b', t(1)), stake('c', t(1))]);

  it('conta a partida em ordem, com o caixa no meio', () => {
    expect(items.map((i) => i.kind)).toEqual(['begin', 'stake', 'stake', 'stake', 'pact', 'pact', 'start', 'round']);
    expect(items.every((i) => i.round === 1)).toBe(true);
  });

  it('em pacto antigo que repetia quem já estava, mostra só quem entrou', () => {
    const old = timeline({ ...m, events: [...m.events.slice(0, 3), pact(t(2), 'a', 'b'), pact(t(3), 'a', 'b', 'c')] }, []);
    expect(old.filter((i) => i.kind === 'pact').map((i) => i.kind === 'pact' && i.playerIds)).toEqual([['a', 'b'], ['c']]);
  });

  it('marca quem entrou num pacto que já existia na rodada', () => {
    const pacts = items.filter((i) => i.kind === 'pact');
    expect(pacts.map((p) => p.kind === 'pact' && p.joined)).toEqual([false, true]);
  });

  it('no início da rodada mostra quem correu com os pontos de antes e depois, e quem joga', () => {
    const s = items.find((i) => i.kind === 'start')!;
    expect(s).toMatchObject({ dealerId: 'a', handId: 'b', fled: [{ playerId: 'c', from: 10, to: 9 }], playing: ['a', 'b'] });
  });

  it('no fim da rodada não desconta de novo quem correu e aponta quem saiu', () => {
    const r = items.find((i) => i.kind === 'round')!;
    expect(r).toMatchObject({ winnerId: 'a', fled: [], lost: [{ playerId: 'b', from: 3, to: 1 }], eliminated: [] });
  });
});

describe('memória financeira da partida', () => {
  const entry = (playerId: string, kind: LedgerEntry['kind'], amountCents: number, at: string, extra: Partial<LedgerEntry> = {}): LedgerEntry => ({
    id: `l${seq++}`,
    at,
    playerId,
    kind,
    amountCents,
    ...extra,
  });
  const m: Match = {
    id: 'm',
    createdAt: t(0),
    firstDealerId: 'a',
    stakeCents: 1000,
    paidOutAt: t(20),
    events: [join('a', t(0), 2), join('b', t(0), 2), join('c', t(0), 2), pact(t(2), 'a', 'b'), round(t(10), 'a')],
  };
  const ledger: LedgerEntry[] = [
    entry('c', 'deposit', 3000, t(-60)), // antes da partida: não entra
    entry('a', 'deposit', 5000, t(1), { refMatchId: 'm' }), // entregou R$ 50 para casar
    entry('a', 'stake', 1000, t(1), { matchId: 'm' }),
    entry('b', 'deposit', 500, t(1), { refMatchId: 'm' }), // entregou R$ 5 e usou R$ 5 de crédito
    entry('b', 'stake', 1000, t(1), { matchId: 'm' }),
    entry('c', 'stake', 1000, t(1), { matchId: 'm' }), // só crédito
    entry('c', 'withdraw', 1000, t(5)), // saque durante a partida
    entry('a', 'prizeCash', 1000, t(20), { matchId: 'm' }),
    entry('a', 'credit', 1000, t(20), { matchId: 'm' }),
    entry('b', 'credit', 1000, t(20), { matchId: 'm' }), // devolução do livrar
  ];
  const items = timeline(m, ledger);
  const of = <K extends TimelineItem['kind']>(kind: K) => items.filter((i): i is Extract<TimelineItem, { kind: K }> => i.kind === kind);

  it('ao casar, mostra o dinheiro entregue, o crédito usado e o troco, com a caixa depois', () => {
    expect(of('stake').map(({ playerId, handedCents, creditUsedCents, changeCents, cashAfter }) => ({ playerId, handedCents, creditUsedCents, changeCents, cashAfter }))).toEqual([
      { playerId: 'a', handedCents: 5000, creditUsedCents: 0, changeCents: 4000, cashAfter: 8000 },
      { playerId: 'b', handedCents: 500, creditUsedCents: 500, changeCents: 0, cashAfter: 8500 },
      { playerId: 'c', handedCents: 0, creditUsedCents: 1000, changeCents: 0, cashAfter: 8500 },
    ]);
    // O dinheiro entregue ao casar não aparece de novo como depósito avulso.
    expect(of('deposit')).toEqual([]);
  });

  it('inclui saques feitos durante a partida, mas não o que aconteceu antes dela', () => {
    expect(of('withdraw').map((w) => [w.playerId, w.cents, w.cashAfter])).toEqual([['c', 1000, 7500]]);
  });

  it('no prêmio, mostra o dinheiro do vencedor, o crédito e as devoluções do livrar', () => {
    expect(of('payout')[0]).toMatchObject({ winners: [{ playerId: 'a', cashCents: 1000, creditCents: 1000 }], refunds: [{ playerId: 'b', cents: 1000 }], cashAfter: 6500 });
  });
});

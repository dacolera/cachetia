import { describe, expect, it } from 'vitest';
import {
  balanceOf,
  balances,
  cashInBox,
  missingStakes,
  openPots,
  payoutEntries,
  payoutPlan,
  validateStake,
  validateWithdraw,
  type LedgerEntry,
  type LedgerKind,
} from './ledger';
import type { Match, MatchEvent } from './types';

let seq = 0;
const join = (playerId: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at: '', playerId, points });
const round = (winnerId: string, fled: string[] = []): MatchEvent => ({ type: 'round', id: `e${seq++}`, at: '', winnerId, fled });
const pact = (...playerIds: string[]): MatchEvent => ({ type: 'pact', id: `e${seq++}`, at: '', playerIds });
const entry = (playerId: string, kind: LedgerKind, amountCents: number, matchId?: string): LedgerEntry => ({
  id: `l${seq++}`,
  at: '',
  playerId,
  kind,
  amountCents,
  matchId,
});
const mk = (e: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry => ({ ...e, id: `l${seq++}`, at: '' });
const match = (id: string, ...events: MatchEvent[]): Match => ({ id, createdAt: '', stakeCents: 1000, events });

/** Conferência do caixa: o dinheiro vivo é sempre os créditos de todos mais os potes em jogo. */
const closes = (ledger: LedgerEntry[], matches: Match[]) =>
  cashInBox(ledger) === [...balances(ledger).values()].reduce((a, b) => a + b, 0) + openPots(ledger, matches);

describe('troco e crédito', () => {
  it('nota de 50 para casar 10: fica com 40 de crédito', () => {
    const ledger = [entry('beto', 'deposit', 5000), entry('beto', 'stake', 1000, 'm1')];
    expect(balanceOf(ledger, 'beto')).toBe(4000);
    expect(cashInBox(ledger)).toBe(5000);
  });

  it('casa a próxima partida com o crédito, sem troco', () => {
    const m2 = match('m2', join('beto'), join('ana'));
    const ledger = [entry('beto', 'deposit', 5000), entry('beto', 'stake', 1000, 'm1')];
    expect(validateStake(m2, ledger, 'beto', 0)).toBeNull();
  });

  it('sem crédito e sem dinheiro não casa', () => {
    const m = match('m', join('ana'), join('beto'));
    expect(validateStake(m, [], 'ana', 0)).toMatch(/insuficiente/);
    expect(validateStake(m, [], 'ana', 500)).toMatch(/insuficiente/);
    expect(validateStake(m, [], 'ana', 1000)).toBeNull();
  });

  it('não casa duas vezes na mesma partida', () => {
    const m = match('m', join('ana'), join('beto'));
    expect(validateStake(m, [entry('ana', 'deposit', 2000), entry('ana', 'stake', 1000, 'm')], 'ana', 0)).toMatch(/já casou/);
  });

  it('saque não passa do crédito', () => {
    const ledger = [entry('ana', 'deposit', 2000)];
    expect(validateWithdraw(ledger, 'ana', 2000)).toBeNull();
    expect(validateWithdraw(ledger, 'ana', 2001)).toMatch(/maior/);
  });

  it('mostra quem ainda não casou, inclusive quem entrou no meio', () => {
    const m = match('m', join('ana'), join('beto'), round('ana'), join('caio', 9));
    expect(missingStakes(m, [entry('ana', 'deposit', 1000), entry('ana', 'stake', 1000, 'm')])).toEqual(['beto', 'caio']);
  });

  it('partida sem valor casado não cobra ninguém', () => {
    expect(missingStakes({ ...match('m', join('ana')), stakeCents: undefined }, [])).toEqual([]);
  });
});

describe('prêmio', () => {
  // 5 jogadores casam 10; Ana, Beto e Caio livram; Ana vence.
  const m = {
    ...match('m', join('ana', 2), join('beto', 1), join('caio', 1), join('davi', 2), join('eva', 2), pact('ana', 'beto', 'caio'), round('ana')),
  };
  const deposits = ['ana', 'beto', 'caio', 'davi', 'eva'].flatMap((id) => [entry(id, 'deposit', id === 'beto' ? 10000 : 1000), entry(id, 'stake', 1000, 'm')]);

  it('vencedor recebe o pote menos as devoluções; quem livrou recebe crédito', () => {
    expect(payoutPlan(m)).toEqual({
      winnerId: 'ana',
      winnerCents: 3000,
      refunds: [
        { playerId: 'beto', cents: 1000 },
        { playerId: 'caio', cents: 1000 },
      ],
    });
  });

  it('prêmio todo em dinheiro', () => {
    const ledger = [...deposits, ...payoutEntries(m, 3000, mk)];
    const paid = [{ ...m, paidOutAt: 'x' }];
    expect(balanceOf(ledger, 'ana')).toBe(0);
    expect(balanceOf(ledger, 'beto')).toBe(9000 + 1000);
    expect(balanceOf(ledger, 'caio')).toBe(1000);
    expect(cashInBox(ledger)).toBe(14000 - 3000);
    expect(closes(ledger, paid)).toBe(true);
  });

  it('sem troco: parte do prêmio fica de crédito para o vencedor', () => {
    const ledger = [...deposits, ...payoutEntries(m, 2000, mk)];
    expect(balanceOf(ledger, 'ana')).toBe(1000);
    expect(closes(ledger, [{ ...m, paidOutAt: 'x' }])).toBe(true);
  });

  it('o dinheiro nunca passa do prêmio', () => {
    const ledger = payoutEntries(m, 999999, mk);
    expect(ledger.find((e) => e.kind === 'prizeCash')?.amountCents).toBe(3000);
  });

  it('antes de pagar, o pote conta como dinheiro em jogo e o caixa fecha', () => {
    expect(openPots(deposits, [m])).toBe(5000);
    expect(closes(deposits, [m])).toBe(true);
  });
});

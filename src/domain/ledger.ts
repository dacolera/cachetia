import { settle } from './money';
import type { Match, PrizeShare } from './types';

/**
 * Movimentos do caixa. Valores sempre positivos, em centavos; o efeito depende do tipo:
 * - deposit: o jogador entregou dinheiro ao caixa (vira crédito dele)
 * - withdraw: o jogador sacou crédito em dinheiro
 * - stake: o jogador casou numa partida (sai do crédito e vai para o pote)
 * - credit: crédito recebido de uma partida (devolução do livrar ou prêmio que ficou na casa)
 * - prizeCash: prêmio pago em dinheiro ao vencedor (sai do caixa, não mexe no crédito)
 */
export type LedgerKind = 'deposit' | 'withdraw' | 'stake' | 'credit' | 'prizeCash';

export interface LedgerEntry {
  id: string;
  at: string;
  playerId: string;
  kind: LedgerKind;
  amountCents: number;
  matchId?: string;
  /**
   * Dinheiro entregue ao casar: a partida em que foi entregue. Não é `matchId` porque o depósito
   * é da pessoa (continua como crédito mesmo se a partida for descartada).
   */
  refMatchId?: string;
  /** Evento em que o movimento aconteceu. Movimentos de antes dos eventos pertencem ao primeiro. */
  eventId?: string;
}

const BALANCE_EFFECT: Record<LedgerKind, number> = { deposit: 1, credit: 1, withdraw: -1, stake: -1, prizeCash: 0 };
const CASH_EFFECT: Record<LedgerKind, number> = { deposit: 1, withdraw: -1, prizeCash: -1, stake: 0, credit: 0 };

export function balanceOf(ledger: LedgerEntry[], playerId: string): number {
  return ledger.reduce((sum, e) => (e.playerId === playerId ? sum + BALANCE_EFFECT[e.kind] * e.amountCents : sum), 0);
}

export function balances(ledger: LedgerEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ledger) out.set(e.playerId, (out.get(e.playerId) ?? 0) + BALANCE_EFFECT[e.kind] * e.amountCents);
  return out;
}

/** Dinheiro vivo que deveria estar na caixa. */
export function cashInBox(ledger: LedgerEntry[]): number {
  return ledger.reduce((sum, e) => sum + CASH_EFFECT[e.kind] * e.amountCents, 0);
}

/** Dinheiro casado em partidas cujo prêmio ainda não foi pago. */
export function openPots(ledger: LedgerEntry[], matches: Match[]): number {
  const paid = new Set(matches.filter((m) => m.paidOutAt).map((m) => m.id));
  return ledger.reduce((sum, e) => (e.kind === 'stake' && e.matchId && !paid.has(e.matchId) ? sum + e.amountCents : sum), 0);
}

export function hasStaked(ledger: LedgerEntry[], matchId: string, playerId: string): boolean {
  return ledger.some((e) => e.kind === 'stake' && e.matchId === matchId && e.playerId === playerId);
}

/** Quem está sentado na partida e ainda não casou. Partidas sem valor casado não cobram. */
export function missingStakes(match: Match, ledger: LedgerEntry[]): string[] {
  if (match.stakeCents === undefined) return [];
  const seated = match.events.flatMap((e) => (e.type === 'join' ? [e.playerId] : []));
  return seated.filter((id) => !hasStaked(ledger, match.id, id));
}

/** Casar: usa o crédito e, se precisar, o dinheiro entregue na hora. O saldo nunca fica negativo. */
export function validateStake(match: Match, ledger: LedgerEntry[], playerId: string, depositCents: number): string | null {
  if (match.stakeCents === undefined) return 'Esta partida não tem valor casado.';
  if (hasStaked(ledger, match.id, playerId)) return 'Esse jogador já casou.';
  if (depositCents < 0) return 'Valor inválido.';
  const available = balanceOf(ledger, playerId) + depositCents;
  if (available < match.stakeCents) return 'Crédito insuficiente: entregue dinheiro para casar.';
  return null;
}

export function validateWithdraw(ledger: LedgerEntry[], playerId: string, amountCents: number): string | null {
  if (amountCents <= 0) return 'Valor inválido.';
  if (amountCents > balanceOf(ledger, playerId)) return 'O saque é maior que o crédito.';
  return null;
}

export interface PayoutPlan {
  /** Quanto cada vencedor recebe do pote (um, ou os dois que racharam), já descontadas as devoluções do livrar. */
  winners: PrizeShare[];
  /** Devoluções do livrar: viram crédito de cada um. */
  refunds: { playerId: string; cents: number }[];
}

export function payoutPlan(match: Match): PayoutPlan | undefined {
  const s = settle(match);
  if (!s) return undefined;
  return { winners: s.winners, refunds: s.returnsTo.map((playerId) => ({ playerId, cents: s.stakeCents })) };
}

/** Lançamentos do pagamento do prêmio: para cada vencedor, o que não sai em dinheiro fica de crédito. */
export function payoutEntries(
  match: Match,
  cashByPlayer: Record<string, number>,
  newEntry: (e: Omit<LedgerEntry, 'id' | 'at'>) => LedgerEntry,
): LedgerEntry[] {
  const plan = payoutPlan(match);
  if (!plan) return [];
  const out: LedgerEntry[] = [];
  for (const w of plan.winners) {
    const cash = Math.max(0, Math.min(cashByPlayer[w.playerId] ?? 0, w.cents));
    if (cash > 0) out.push(newEntry({ playerId: w.playerId, kind: 'prizeCash', amountCents: cash, matchId: match.id }));
    if (w.cents - cash > 0) out.push(newEntry({ playerId: w.playerId, kind: 'credit', amountCents: w.cents - cash, matchId: match.id }));
  }
  for (const r of plan.refunds) out.push(newEntry({ playerId: r.playerId, kind: 'credit', amountCents: r.cents, matchId: match.id }));
  return out;
}

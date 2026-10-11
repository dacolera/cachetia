import { balances, cashInBox, hasPot, type LedgerEntry, type LedgerKind } from './ledger';
import type { GameEvent, Match } from './types';

const byStart = (events: GameEvent[]) => [...events].sort((a, b) => a.startedAt.localeCompare(b.startedAt));

/** Evento aberto agora (no máximo um: só se abre outro depois de encerrar o anterior). */
export function openEvent(events: GameEvent[]): GameEvent | undefined {
  return events.find((e) => !e.endedAt);
}

/** Evento de uma partida ou movimento: sem marcação, é de antes dos eventos e fica com o primeiro. */
export function eventIdOf(item: { eventId?: string }, events: GameEvent[]): string | undefined {
  return item.eventId ?? byStart(events)[0]?.id;
}

export function eventMatches(matches: Match[], events: GameEvent[], eventId: string): Match[] {
  return matches.filter((m) => eventIdOf(m, events) === eventId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Evento criado para os dados de antes dos eventos: começa no primeiro registro e fica aberto. */
export function legacyEvent(matches: Match[], ledger: LedgerEntry[], id: string): GameEvent | undefined {
  const first = [...matches.map((m) => m.createdAt), ...ledger.map((e) => e.at)].sort()[0];
  return first ? { id, name: 'Evento 1', startedAt: first } : undefined;
}

export function defaultEventName(events: GameEvent[], now = new Date()): string {
  const day = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `Evento ${events.length + 1} · ${day}`;
}

const CASH_KINDS: LedgerKind[] = ['deposit', 'withdraw', 'prizeCash'];
const CASH_SIGN: Partial<Record<LedgerKind, number>> = { deposit: 1, withdraw: -1, prizeCash: -1 };

export interface CashMove {
  entry: LedgerEntry;
  /** Número da partida no evento (1, 2...), ou nenhum se foi feito no caixa fora de partida. */
  matchNumber?: number;
  /** O dinheiro foi entregue na hora de casar. */
  atStake: boolean;
  /** Pagamento do encerramento do evento. */
  atClose: boolean;
  delta: number;
  cashAfter: number;
}

export interface EventCash {
  event: GameEvent;
  matches: Match[];
  /** Dinheiro que já estava na caixa quando o evento abriu (zero, a não ser em dados antigos). */
  opening: number;
  moves: CashMove[];
  cashIn: number;
  cashOut: number;
  closing: number;
}

/** Dinheiro vivo do evento: abertura, cada entrada e saída (de qualquer partida ou do caixa) e quanto deve ter. */
export function eventCash(ledger: LedgerEntry[], matches: Match[], events: GameEvent[], event: GameEvent): EventCash {
  const mine = (e: LedgerEntry) => eventIdOf(e, events) === event.id;
  const first = ledger.findIndex(mine);
  const opening = first === -1 ? 0 : cashInBox(ledger.slice(0, first));
  const list = eventMatches(matches, events, event.id);
  const numberOf = (id?: string) => {
    const i = list.findIndex((m) => m.id === id);
    return i === -1 ? undefined : i + 1;
  };
  /** Partida aberta naquele instante, para os movimentos feitos no caixa durante uma partida. */
  const openAt = (at: string) => {
    const i = list.findIndex((m, k) => at >= m.createdAt && at < (list[k + 1]?.createdAt ?? '￿') && (!m.paidOutAt || at <= m.paidOutAt));
    return i === -1 ? undefined : i + 1;
  };

  let cash = opening;
  const moves: CashMove[] = [];
  for (const e of ledger) {
    if (!mine(e) || !CASH_KINDS.includes(e.kind)) continue;
    const delta = CASH_SIGN[e.kind]! * e.amountCents;
    cash += delta;
    const atClose = !!event.endedAt && e.kind === 'withdraw' && e.at === event.endedAt;
    moves.push({
      entry: e,
      matchNumber: atClose ? undefined : (numberOf(e.matchId ?? e.refMatchId) ?? openAt(e.at)),
      atStake: !!e.refMatchId,
      atClose,
      delta,
      cashAfter: cash,
    });
  }
  const cashIn = moves.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const cashOut = -moves.filter((m) => m.delta < 0).reduce((s, m) => s + m.delta, 0);
  return { event, matches: list, opening, moves, cashIn, cashOut, closing: cash };
}

export interface CloseBlocker {
  matchId: string;
  /** Número da partida no evento. */
  number: number;
  reason: 'ongoing' | 'unpaid';
}

export interface ClosePlan {
  /** O que impede encerrar agora: cada partida que precisa ser terminada (ou descartada) ou paga. */
  blockers: CloseBlocker[];
  /** Crédito que sobrou para cada um: é pago em dinheiro no encerramento. */
  payouts: { playerId: string; cents: number }[];
  totalCents: number;
}

/**
 * Encerrar o evento: sem partida em andamento nem prêmio a pagar; o crédito de todos vira dinheiro.
 * Só há prêmio a pagar se alguém casou pelo caixa: partidas de antes do caixa têm valor, mas o
 * dinheiro foi acertado fora do app e não há pote para pagar.
 */
export function closePlan(ledger: LedgerEntry[], matches: Match[], events: GameEvent[], event: GameEvent): ClosePlan {
  const list = eventMatches(matches, events, event.id);
  const blockers: CloseBlocker[] = [];
  list.forEach((m, i) => {
    if (!m.finishedAt) blockers.push({ matchId: m.id, number: i + 1, reason: 'ongoing' });
    else if (hasPot(ledger, m) && !m.paidOutAt) blockers.push({ matchId: m.id, number: i + 1, reason: 'unpaid' });
  });
  const payouts = [...balances(ledger).entries()].filter(([, cents]) => cents > 0).map(([playerId, cents]) => ({ playerId, cents }));
  return { blockers, payouts, totalCents: payouts.reduce((s, p) => s + p.cents, 0) };
}

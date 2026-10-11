import { cashInBox, type LedgerEntry } from './ledger';
import { roundPact } from './money';
import { computeState } from './rules';
import type { Match } from './types';

export interface PointsChange {
  playerId: string;
  from: number;
  to: number;
}

/** Um acontecimento da partida, na ordem em que ocorreu. `round` é a rodada a que pertence. */
export type TimelineItem = { at: string; round: number } & (
  | { kind: 'begin'; playerIds: string[]; stakeCents?: number }
  | { kind: 'join'; playerId: string; points: number }
  | { kind: 'stake'; playerId: string; cents: number; handedCents: number; creditUsedCents: number; changeCents: number; cashAfter: number }
  | { kind: 'deposit'; playerId: string; cents: number; cashAfter: number }
  | { kind: 'withdraw'; playerId: string; cents: number; cashAfter: number }
  | { kind: 'pact'; playerIds: string[]; joined: boolean }
  | { kind: 'start'; dealerId?: string; handId?: string; playHandId?: string; fled: PointsChange[]; playing: string[] }
  | { kind: 'round'; winnerId: string; fled: PointsChange[]; lost: PointsChange[]; eliminated: string[] }
  | { kind: 'split'; shares: { playerId: string; cents: number }[] }
  | { kind: 'payout'; winners: { playerId: string; cashCents: number; creditCents: number }[]; refunds: { playerId: string; cents: number }[]; cashAfter: number }
);

/**
 * Memória da partida: os eventos e os movimentos de caixa dela, em ordem, com quanto cada
 * um tinha antes e depois. Os pontos vêm de recalcular a partida até cada evento.
 */
export function timeline(match: Match, ledger: LedgerEntry[]): TimelineItem[] {
  const items: { item: TimelineItem; seq: number }[] = [];
  const push = (item: TimelineItem) => items.push({ item, seq: items.length });
  const events = match.events;
  const firstPlay = events.findIndex((e) => e.type !== 'join');
  const initial = events.slice(0, firstPlay === -1 ? events.length : firstPlay);
  if (initial.length > 0) {
    push({ kind: 'begin', at: match.createdAt, round: 1, playerIds: initial.map((e) => (e.type === 'join' ? e.playerId : '')), stakeCents: match.stakeCents });
  }

  for (let i = initial.length; i < events.length; i++) {
    const ev = events[i];
    const before = computeState({ events: events.slice(0, i), firstDealerId: match.firstDealerId });
    const after = computeState({ events: events.slice(0, i + 1), firstDealerId: match.firstDealerId });
    const round = before.roundsPlayed + 1;
    const pts = (st: typeof before, id: string) => st.standings.find((s) => s.playerId === id)?.points ?? 0;
    const change = (id: string): PointsChange => ({ playerId: id, from: pts(before, id), to: pts(after, id) });

    if (ev.type === 'join') push({ kind: 'join', at: ev.at, round, playerId: ev.playerId, points: ev.points });
    else if (ev.type === 'pact') {
      // Entrou num pacto que já existia nesta rodada, ou abriu um novo.
      // Só quem é novo no pacto da rodada aparece (partidas antigas podiam repetir quem já estava).
      const existing = roundPact({ events: events.slice(0, i) })?.playerIds ?? [];
      const fresh = ev.playerIds.filter((id) => !existing.includes(id));
      if (fresh.length > 0) push({ kind: 'pact', at: ev.at, round, playerIds: fresh, joined: existing.length > 0 });
    } else if (ev.type === 'start') {
      push({ kind: 'start', at: ev.at, round, dealerId: before.dealerId, handId: before.handId, playHandId: after.current?.handId, fled: ev.fled.map(change), playing: after.current?.playingIds ?? [] });
    } else if (ev.type === 'split') {
      push({ kind: 'split', at: ev.at, round, shares: ev.shares });
    } else {
      // Quem correu numa rodada em duas etapas já perdeu o ponto no início; aqui só entra o que mudou agora.
      const fled = ev.fled.map(change).filter((c) => c.from !== c.to);
      const lost = before.activeIds.filter((id) => id !== ev.winnerId && !ev.fled.includes(id)).map(change);
      const eliminated = before.activeIds.filter((id) => pts(after, id) === 0);
      push({ kind: 'round', at: ev.at, round, winnerId: ev.winnerId, fled, lost, eliminated });
    }
  }

  const final = computeState(match);
  const rounds = final.roundsPlayed;
  const roundAt = (at: string) => {
    // Rodada em que um movimento de caixa aconteceu: a seguinte à última rodada fechada antes dele.
    const closed = events.filter((e) => e.type === 'round' && e.at <= at).length;
    return Math.min(closed + 1, final.finished ? rounds : rounds + 1);
  };
  /** Dinheiro vivo que deveria estar na caixa logo depois do lançamento `entry`. */
  const cashAfter = (entry: LedgerEntry) => cashInBox(ledger.slice(0, ledger.indexOf(entry) + 1));

  // Depósitos e saques feitos no caixa enquanto a partida estava aberta também entram na memória.
  const end = match.paidOutAt ?? match.finishedAt;
  const during = (at: string) => at >= match.createdAt && (!end || at <= end);
  const handedAt = new Set<LedgerEntry>();
  for (const e of ledger) {
    if (e.kind !== 'stake' || e.matchId !== match.id) continue;
    // O dinheiro entregue na hora de casar fica junto do casar: entregou, usou crédito, troco.
    const handed = ledger.find((d) => d.kind === 'deposit' && d.refMatchId === match.id && d.playerId === e.playerId);
    if (handed) handedAt.add(handed);
    const handedCents = handed?.amountCents ?? 0;
    push({
      kind: 'stake',
      at: e.at,
      round: roundAt(e.at),
      playerId: e.playerId,
      cents: e.amountCents,
      handedCents,
      creditUsedCents: Math.max(0, e.amountCents - handedCents),
      changeCents: Math.max(0, handedCents - e.amountCents),
      cashAfter: cashAfter(e),
    });
  }
  for (const e of ledger) {
    if (handedAt.has(e) || e.matchId || !during(e.at)) continue;
    if (e.refMatchId && e.refMatchId !== match.id) continue;
    if (e.kind === 'deposit' || e.kind === 'withdraw') push({ kind: e.kind, at: e.at, round: roundAt(e.at), playerId: e.playerId, cents: e.amountCents, cashAfter: cashAfter(e) });
  }

  const winnerIds = final.split ? final.split.map((w) => w.playerId) : final.winnerId ? [final.winnerId] : [];
  if (winnerIds.length > 0 && match.paidOutAt) {
    const prize = ledger.filter((e) => e.matchId === match.id && (e.kind === 'prizeCash' || e.kind === 'credit'));
    const of = (id: string, kind: string) => prize.filter((e) => e.playerId === id && e.kind === kind).reduce((sum, e) => sum + e.amountCents, 0);
    const winners = winnerIds.map((id) => ({ playerId: id, cashCents: of(id, 'prizeCash'), creditCents: of(id, 'credit') }));
    const refunds = prize.filter((e) => e.kind === 'credit' && !winnerIds.includes(e.playerId)).map((e) => ({ playerId: e.playerId, cents: e.amountCents }));
    const last = prize[prize.length - 1];
    push({ kind: 'payout', at: match.paidOutAt, round: rounds, winners, refunds, cashAfter: last ? cashAfter(last) : cashInBox(ledger) });
  }

  // No mesmo instante, o dinheiro entra no caixa antes de ser usado para casar.
  const rank = (i: TimelineItem) => (i.kind === 'deposit' || i.kind === 'withdraw' ? 0 : 1);
  return items.sort((a, b) => a.item.at.localeCompare(b.item.at) || rank(a.item) - rank(b.item) || a.seq - b.seq).map((x) => x.item);
}

import { computeState } from './rules';
import type { Match, MatchState, PrizeShare } from './types';

export const DEFAULT_STAKE_CENTS = 1000;
/** Na mesa não existe valor quebrado: casa-se sempre um múltiplo de R$ 10,00. */
export const STAKE_STEP_CENTS = 1000;

export function isValidStake(cents: number): boolean {
  return cents > 0 && cents % STAKE_STEP_CENTS === 0;
}

export interface Pact {
  playerIds: string[];
  /** Rodada em que o pacto foi feito (a próxima a ser jogada naquele momento). */
  round: number;
}

/**
 * Pactos da partida, um por rodada: todo livrar feito na mesma rodada entra no mesmo pacto
 * (quem chega depois se soma aos que já estavam). Pactos de rodadas diferentes nunca se juntam.
 */
export function pacts(match: Pick<Match, 'events'>): Pact[] {
  let rounds = 0;
  const out: Pact[] = [];
  for (const ev of match.events) {
    if (ev.type === 'round') rounds++;
    if (ev.type !== 'pact') continue;
    const last = out[out.length - 1];
    if (last?.round === rounds + 1) last.playerIds = [...new Set([...last.playerIds, ...ev.playerIds])];
    else out.push({ playerIds: [...ev.playerIds], round: rounds + 1 });
  }
  return out;
}

/** Pacto da rodada que está para ser jogada (ou em jogo), se alguém já livrou nela. */
export function roundPact(match: Pick<Match, 'events'>): Pact | undefined {
  const rounds = match.events.filter((e) => e.type === 'round').length;
  return pacts(match).find((p) => p.round === rounds + 1);
}

/** Com quem o jogador livrou, somando todos os pactos de que participou. */
export function partnersOf(match: Pick<Match, 'events'>, playerId: string): string[] {
  const partners = new Set<string>();
  for (const p of pacts(match)) {
    if (!p.playerIds.includes(playerId)) continue;
    for (const id of p.playerIds) if (id !== playerId) partners.add(id);
  }
  return [...partners];
}

/**
 * `playerIds` são só os que estão livrando agora. Se a rodada já tem pacto, basta um:
 * ele se soma ao pacto da rodada. Sem pacto na rodada, são precisos pelo menos dois.
 */
export function validatePact(match: Pick<Match, 'events'>, state: MatchState, playerIds: string[]): string | null {
  const ids = new Set(playerIds);
  const current = roundPact(match)?.playerIds ?? [];
  if (state.finished) return 'A partida já terminou.';
  for (const id of ids) {
    if (!state.activeIds.includes(id)) return 'Só quem ainda está na mesa pode livrar.';
    if (current.includes(id)) return 'Esse jogador já está livrando nesta rodada.';
  }
  if (ids.size === 0) return 'Escolha quem vai livrar.';
  if (current.length + ids.size < 2) return 'Escolha pelo menos dois jogadores.';
  const group = [...current, ...ids];
  const isNew = [...ids].some((a) => {
    const partners = partnersOf(match, a);
    return group.some((b) => b !== a && !partners.includes(b));
  });
  if (!isNew) return 'Esses jogadores já estão livrando entre si.';
  return null;
}

/** Pote: cada jogador que sentou na mesa, inclusive quem entrou no meio, casou o mesmo valor. */
export function pot(match: Match): number | undefined {
  if (match.stakeCents === undefined) return undefined;
  const joined = match.events.filter((e) => e.type === 'join').length;
  return joined * match.stakeCents;
}

export interface Settlement {
  stakeCents: number;
  potCents: number;
  /** Quem leva o prêmio e quanto: um vencedor, ou os dois que racharam. */
  winners: PrizeShare[];
  /** Com quem os vencedores livraram: cada um recebe de volta o valor que casou (uma vez só). */
  returnsTo: string[];
  /** Resultado de cada jogador na partida, em centavos (positivo ganhou, negativo perdeu). */
  net: Record<string, number>;
}

/** Prêmio de quem vence (ou racha): o pote menos as devoluções do livrar a quem livrou com eles. */
export function prizeFor(match: Match, winnerIds: string[]): { potCents: number; returnsTo: string[]; prizeCents: number } | undefined {
  const potCents = pot(match);
  if (potCents === undefined || match.stakeCents === undefined) return undefined;
  const returnsTo = [...new Set(winnerIds.flatMap((id) => partnersOf(match, id)))].filter((id) => !winnerIds.includes(id));
  return { potCents, returnsTo, prizeCents: potCents - returnsTo.length * match.stakeCents };
}

export function settle(match: Match): Settlement | undefined {
  const state = computeState(match);
  const winnerIds = state.split ? state.split.map((s) => s.playerId) : state.winnerId ? [state.winnerId] : [];
  const prize = winnerIds.length > 0 ? prizeFor(match, winnerIds) : undefined;
  if (!prize || match.stakeCents === undefined) return undefined;
  const stake = match.stakeCents;
  const winners = state.split ?? [{ playerId: winnerIds[0], cents: prize.prizeCents }];
  const net: Record<string, number> = {};
  for (const s of state.standings) net[s.playerId] = prize.returnsTo.includes(s.playerId) ? 0 : -stake;
  for (const w of winners) net[w.playerId] = w.cents - stake;
  return { stakeCents: stake, potCents: prize.potCents, winners, returnsTo: prize.returnsTo, net };
}

/** Rachar: só com dois na mesa, fora de uma rodada em jogo, e as partes somando o prêmio. */
export function validateSplit(match: Match, state: MatchState, shares: PrizeShare[]): string | null {
  if (state.finished) return 'A partida já terminou.';
  if (state.current) return 'Termine a rodada em jogo antes.';
  if (state.activeIds.length !== 2) return 'Só dá para rachar com dois jogadores na mesa.';
  const ids = shares.map((s) => s.playerId);
  if (ids.length !== 2 || !state.activeIds.every((id) => ids.includes(id))) return 'O racha é entre os dois que estão na mesa.';
  if (shares.some((s) => s.cents < 0 || !Number.isInteger(s.cents))) return 'Valor inválido.';
  const prize = prizeFor(match, ids);
  if (!prize) return 'Esta partida não tem valor casado.';
  if (shares.reduce((sum, s) => sum + s.cents, 0) !== prize.prizeCents) return 'As partes precisam somar o prêmio.';
  return null;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(cents: number): string {
  return BRL.format(cents / 100);
}

/** Lê um valor digitado ("10", "12,50", "R$ 7,5") e devolve em centavos. */
export function parseMoney(text: string): number | undefined {
  const clean = text.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
  if (!clean) return undefined;
  const value = Math.round(Number(clean) * 100);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

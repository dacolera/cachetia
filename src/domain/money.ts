import { computeState } from './rules';
import type { Match, MatchState } from './types';

export const DEFAULT_STAKE_CENTS = 1000;

export interface Pact {
  playerIds: string[];
  /** Rodada em que o pacto foi feito (a próxima a ser jogada naquele momento). */
  round: number;
}

export function pacts(match: Pick<Match, 'events'>): Pact[] {
  let rounds = 0;
  const out: Pact[] = [];
  for (const ev of match.events) {
    if (ev.type === 'round') rounds++;
    if (ev.type === 'pact') out.push({ playerIds: ev.playerIds, round: rounds + 1 });
  }
  return out;
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

export function validatePact(match: Pick<Match, 'events'>, state: MatchState, playerIds: string[]): string | null {
  const ids = new Set(playerIds);
  if (state.finished) return 'A partida já terminou.';
  if (ids.size < 2) return 'Escolha pelo menos dois jogadores.';
  for (const id of ids) if (!state.activeIds.includes(id)) return 'Só quem ainda está na mesa pode livrar.';
  const isNew = [...ids].some((a) => {
    const partners = partnersOf(match, a);
    return [...ids].some((b) => b !== a && !partners.includes(b));
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
  winnerId: string;
  /** Com quem o vencedor livrou: cada um recebe de volta o valor que casou. */
  returnsTo: string[];
  /** Resultado de cada jogador na partida, em centavos (positivo ganhou, negativo perdeu). */
  net: Record<string, number>;
}

export function settle(match: Match): Settlement | undefined {
  const state = computeState(match);
  const potCents = pot(match);
  if (!state.winnerId || potCents === undefined || match.stakeCents === undefined) return undefined;
  const stake = match.stakeCents;
  const returnsTo = partnersOf(match, state.winnerId);
  const net: Record<string, number> = {};
  for (const s of state.standings) net[s.playerId] = returnsTo.includes(s.playerId) ? 0 : -stake;
  net[state.winnerId] = potCents - stake - returnsTo.length * stake;
  return { stakeCents: stake, potCents, winnerId: state.winnerId, returnsTo, net };
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

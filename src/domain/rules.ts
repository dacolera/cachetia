import type { Match, MatchEvent, MatchState, RoundEvent, RoundOutcome, Standing } from './types';

export const START_POINTS = 10;
export const PENALTY: Record<RoundOutcome, number> = { won: 0, fled: 1, lost: 2 };
export const MIN_PLAYERS = 2;
/** 2 baralhos, 9 cartas por jogador e 1 vira: com 12 não fecha a conta. */
export const MAX_PLAYERS = 11;
/** Com 1 ponto o jogador está de borracha: é obrigado a jogar, não pode fugir. */
export const BORRACHA = 1;
/** Dá pra entrar no meio até a 5ª rodada, com 6 pontos. */
export const LAST_JOIN_ROUND = 5;

export function computeState(match: Pick<Match, 'events' | 'firstDealerId'>): MatchState {
  const byId = new Map<string, Standing>();
  // A ordem da lista é a ordem da mesa no sentido anti-horário, que é o sentido do jogo.
  const seats: string[] = [];
  const dealers: string[] = [];
  let roundsPlayed = 0;

  const nextDealer = () => {
    const active = (id: string) => byId.get(id)!.points > 0;
    if (dealers.length === 0) {
      const first = match.firstDealerId;
      return first && byId.has(first) && active(first) ? first : seats.find(active);
    }
    const from = seats.indexOf(dealers[dealers.length - 1]);
    for (let i = 1; i <= seats.length; i++) {
      const id = seats[(from + i) % seats.length];
      if (active(id)) return id;
    }
    return undefined;
  };

  for (const ev of match.events) {
    if (ev.type === 'join') {
      byId.set(ev.playerId, { playerId: ev.playerId, points: ev.points, joinedInRound: roundsPlayed });
      const after = ev.seatAfter ? seats.indexOf(ev.seatAfter) : -1;
      if (after === -1) seats.push(ev.playerId);
      else seats.splice(after + 1, 0, ev.playerId);
      continue;
    }
    dealers.push(nextDealer()!);
    roundsPlayed++;
    const fled = new Set(ev.fled);
    for (const s of byId.values()) {
      if (s.points <= 0 || s.playerId === ev.winnerId) continue;
      s.points = Math.max(0, s.points - PENALTY[fled.has(s.playerId) ? 'fled' : 'lost']);
      if (s.points === 0) s.eliminatedInRound = roundsPlayed;
    }
  }

  const standings = seats.map((id) => byId.get(id)!);
  const activeIds = standings.filter((s) => s.points > 0).map((s) => s.playerId);
  const finished = roundsPlayed > 0 && activeIds.length === 1;
  return {
    standings,
    roundsPlayed,
    activeIds,
    finished,
    dealers,
    dealerId: finished ? undefined : nextDealer(),
    winnerId: finished ? activeIds[0] : undefined,
  };
}

/** Quem entra no meio começa como se tivesse fugido de todas as rodadas anteriores. */
export function joinPoints(state: MatchState): number {
  return START_POINTS - state.roundsPlayed * PENALTY.fled;
}

export function joinOpen(state: MatchState): boolean {
  return !state.finished && state.roundsPlayed < LAST_JOIN_ROUND && state.activeIds.length < MAX_PLAYERS;
}

export function isBorracha(points: number): boolean {
  return points === BORRACHA;
}

export function canJoin(state: MatchState, playerId: string): string | null {
  if (state.finished) return 'A partida já terminou.';
  if (state.roundsPlayed >= LAST_JOIN_ROUND) return `Só dá pra entrar até a ${LAST_JOIN_ROUND}ª rodada.`;
  if (state.standings.some((s) => s.playerId === playerId)) return 'Esse jogador já está na partida.';
  if (state.activeIds.length >= MAX_PLAYERS) return `A mesa já tem ${MAX_PLAYERS} jogadores.`;
  return null;
}

export function validateRound(state: MatchState, round: Pick<RoundEvent, 'winnerId' | 'fled'>): string | null {
  if (state.finished) return 'A partida já terminou.';
  if (state.activeIds.length < MIN_PLAYERS) return `São necessários pelo menos ${MIN_PLAYERS} jogadores.`;
  if (!state.activeIds.includes(round.winnerId)) return 'O vencedor precisa estar na mesa.';
  for (const id of round.fled) {
    if (id === round.winnerId) return 'O vencedor não pode ter fugido.';
    if (!state.activeIds.includes(id)) return 'Só quem está na mesa pode fugir.';
    if (isBorracha(state.standings.find((s) => s.playerId === id)!.points)) return 'Quem está de borracha não pode fugir.';
  }
  return null;
}

/** Pontuação de cada jogador ativo se a rodada for confirmada. */
export function previewRound(state: MatchState, outcomes: Record<string, RoundOutcome>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of state.standings) {
    if (s.points <= 0) continue;
    out[s.playerId] = Math.max(0, s.points - PENALTY[outcomes[s.playerId] ?? 'lost']);
  }
  return out;
}

/** Só rodadas e entradas no meio da partida podem ser desfeitas; a formação inicial da mesa não. */
export function lastUndoable(match: Match): MatchEvent | undefined {
  const last = match.events[match.events.length - 1];
  if (!last) return undefined;
  if (last.type === 'round') return last;
  return match.events.some((e) => e.type === 'round') ? last : undefined;
}

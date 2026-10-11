import { settle } from './money';
import { computeState } from './rules';
import type { Match, Player } from './types';

export interface PlayerStats {
  player: Player;
  matches: number;
  wins: number;
  roundsWon: number;
  winRate: number;
}

export function ranking(players: Player[], matches: Match[]): PlayerStats[] {
  const stats = new Map<string, PlayerStats>(
    players.map((p) => [p.id, { player: p, matches: 0, wins: 0, roundsWon: 0, winRate: 0 }]),
  );
  for (const m of matches) {
    if (!m.finishedAt) continue;
    const state = computeState(m);
    for (const s of state.standings) {
      const st = stats.get(s.playerId);
      if (st) st.matches++;
    }
    if (state.winnerId) {
      const st = stats.get(state.winnerId);
      if (st) st.wins++;
    }
    for (const ev of m.events) {
      if (ev.type !== 'round') continue;
      const st = stats.get(ev.winnerId);
      if (st) st.roundsWon++;
    }
  }
  return [...stats.values()]
    .filter((s) => s.matches > 0)
    .map((s) => ({ ...s, winRate: s.wins / s.matches }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.roundsWon - a.roundsWon);
}

export interface MoneyStats {
  player: Player;
  /** Partidas terminadas com valor casado de que participou. */
  matches: number;
  /** Total casado nessas partidas. */
  stakedCents: number;
  /** Total recebido: prêmios, partes de racha e devoluções do livrar. */
  receivedCents: number;
  /** Lucro: o recebido menos o casado. */
  netCents: number;
  /** Melhor resultado numa partida só. */
  bestCents: number;
}

/** Ranking de dinheiro: quanto cada um ganhou de fato, descontado o que investiu nas casadas. */
export function moneyRanking(players: Player[], matches: Match[]): MoneyStats[] {
  const stats = new Map<string, MoneyStats>(
    players.map((p) => [p.id, { player: p, matches: 0, stakedCents: 0, receivedCents: 0, netCents: 0, bestCents: -Infinity }]),
  );
  for (const m of matches) {
    if (!m.finishedAt) continue;
    const s = settle(m);
    if (!s) continue;
    for (const [id, net] of Object.entries(s.net)) {
      const st = stats.get(id);
      if (!st) continue;
      st.matches++;
      st.stakedCents += s.stakeCents;
      st.receivedCents += net + s.stakeCents;
      st.netCents += net;
      st.bestCents = Math.max(st.bestCents, net);
    }
  }
  return [...stats.values()]
    .filter((s) => s.matches > 0)
    .sort((a, b) => b.netCents - a.netCents || b.receivedCents - a.receivedCents || a.player.name.localeCompare(b.player.name, 'pt-BR'));
}

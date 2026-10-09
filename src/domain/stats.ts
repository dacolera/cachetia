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

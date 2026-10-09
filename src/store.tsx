import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { START_POINTS, canJoin, computeState, lastUndoable, validateRound } from './domain/rules';
import type { Match, MatchEvent, Player } from './domain/types';
import { localRepository } from './storage/localRepository';
import type { Backup, Repository } from './storage/repository';

function uid(): string {
  // randomUUID só existe em contexto seguro (https/localhost); no tablet via IP da rede local não existe
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const now = () => new Date().toISOString();

interface Store {
  loaded: boolean;
  players: Player[];
  matches: Match[];
  playerName(id: string): string;
  player(id: string): Player | undefined;
  addPlayer(name: string, photo?: string): Player;
  updatePlayer(id: string, changes: Partial<Pick<Player, 'name' | 'photo' | 'archived'>>): void;
  startMatch(playerIds: string[], firstDealerId: string, cashierId: string): Match;
  addRound(matchId: string, winnerId: string, fled: string[]): void;
  joinMatch(matchId: string, playerId: string, points: number, seatAfter?: string): void;
  undo(matchId: string): void;
  deleteMatch(matchId: string): void;
  exportBackup(): Promise<Backup>;
  importBackup(backup: Backup): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, repo = localRepository }: { children: ReactNode; repo?: Repository }) {
  const [loaded, setLoaded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  const reload = useCallback(async () => {
    const [p, m] = await Promise.all([repo.listPlayers(), repo.listMatches()]);
    setPlayers(p);
    setMatches(m);
    setLoaded(true);
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const store = useMemo<Store>(() => {
    const findMatch = (id: string) => {
      const m = matches.find((x) => x.id === id);
      if (!m) throw new Error('Partida não encontrada.');
      return m;
    };

    const putMatch = (m: Match) => {
      const state = computeState(m);
      const next: Match = { ...m, finishedAt: state.finished ? (m.finishedAt ?? now()) : undefined };
      setMatches((list) => (list.some((x) => x.id === next.id) ? list.map((x) => (x.id === next.id ? next : x)) : [...list, next]));
      void repo.saveMatch(next);
    };

    const append = (matchId: string, ev: MatchEvent) => {
      const m = findMatch(matchId);
      putMatch({ ...m, events: [...m.events, ev] });
    };

    return {
      loaded,
      players,
      matches,
      playerName: (id) => players.find((p) => p.id === id)?.name ?? '?',
      player: (id) => players.find((p) => p.id === id),
      addPlayer(name, photo) {
        const p: Player = { id: uid(), name: name.trim(), createdAt: now(), photo };
        setPlayers((list) => [...list, p]);
        void repo.savePlayer(p);
        return p;
      },
      updatePlayer(id, changes) {
        const p = players.find((x) => x.id === id);
        if (!p) return;
        const next = { ...p, ...changes, name: (changes.name ?? p.name).trim() };
        setPlayers((list) => list.map((x) => (x.id === id ? next : x)));
        void repo.savePlayer(next);
      },
      startMatch(playerIds, firstDealerId, cashierId) {
        const at = now();
        const m: Match = {
          id: uid(),
          createdAt: at,
          firstDealerId,
          cashierId,
          events: playerIds.map((playerId) => ({ type: 'join', id: uid(), at, playerId, points: START_POINTS })),
        };
        putMatch(m);
        return m;
      },
      addRound(matchId, winnerId, fled) {
        const err = validateRound(computeState(findMatch(matchId)), { winnerId, fled });
        if (err) throw new Error(err);
        append(matchId, { type: 'round', id: uid(), at: now(), winnerId, fled });
      },
      joinMatch(matchId, playerId, points, seatAfter) {
        const err = canJoin(computeState(findMatch(matchId)), playerId);
        if (err) throw new Error(err);
        append(matchId, { type: 'join', id: uid(), at: now(), playerId, points, seatAfter });
      },
      undo(matchId) {
        const m = findMatch(matchId);
        if (!lastUndoable(m)) return;
        putMatch({ ...m, events: m.events.slice(0, -1) });
      },
      deleteMatch(matchId) {
        setMatches((list) => list.filter((x) => x.id !== matchId));
        void repo.deleteMatch(matchId);
      },
      exportBackup: () => repo.exportAll(),
      async importBackup(backup) {
        await repo.importAll(backup);
        await reload();
      },
    };
  }, [loaded, players, matches, repo, reload]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do StoreProvider');
  return s;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

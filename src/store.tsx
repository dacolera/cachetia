import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { missingStakes, payoutEntries, validateStake, validateWithdraw, type LedgerEntry } from './domain/ledger';
import { validatePact } from './domain/money';
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
  startMatch(playerIds: string[], firstDealerId: string, cashierId: string, stakeCents: number): Match;
  addPact(matchId: string, playerIds: string[]): void;
  addRound(matchId: string, winnerId: string, fled: string[]): void;
  joinMatch(matchId: string, playerId: string, points: number): void;
  undo(matchId: string): void;
  deleteMatch(matchId: string): void;
  ledger: LedgerEntry[];
  /** Casar: usa o crédito e, se precisar, o dinheiro entregue na hora (o excesso vira crédito). */
  stake(matchId: string, playerId: string, depositCents: number): void;
  deposit(playerId: string, cents: number): void;
  withdraw(playerId: string, cents: number): void;
  /** Paga o prêmio: `cashCents` sai em dinheiro, o resto do prêmio fica de crédito. */
  payOut(matchId: string, cashCents: number): void;
  removeLedgerEntry(id: string): void;
  exportBackup(): Promise<Backup>;
  importBackup(backup: Backup): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, repo = localRepository }: { children: ReactNode; repo?: Repository }) {
  const [loaded, setLoaded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const reload = useCallback(async () => {
    const [p, m, l] = await Promise.all([repo.listPlayers(), repo.listMatches(), repo.listLedger()]);
    setPlayers(p);
    setMatches(m);
    setLedger(l);
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

    const addEntries = (entries: LedgerEntry[]) => {
      if (entries.length === 0) return;
      setLedger((list) => [...list, ...entries]);
      void repo.addLedger(entries);
    };

    const removeEntries = (drop: (e: LedgerEntry) => boolean) => {
      const ids = ledger.filter(drop).map((e) => e.id);
      if (ids.length === 0) return;
      const set = new Set(ids);
      setLedger((list) => list.filter((e) => !set.has(e.id)));
      void repo.removeLedger(ids);
    };

    const newEntry = (e: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry => ({ ...e, id: uid(), at: now() });

    const isPayout = (matchId: string) => (e: LedgerEntry) => e.matchId === matchId && (e.kind === 'credit' || e.kind === 'prizeCash');

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
      startMatch(playerIds, firstDealerId, cashierId, stakeCents) {
        const at = now();
        const m: Match = {
          id: uid(),
          createdAt: at,
          firstDealerId,
          cashierId,
          stakeCents,
          events: playerIds.map((playerId) => ({ type: 'join', id: uid(), at, playerId, points: START_POINTS })),
        };
        putMatch(m);
        return m;
      },
      addRound(matchId, winnerId, fled) {
        const m = findMatch(matchId);
        const err = validateRound(computeState(m), { winnerId, fled });
        if (err) throw new Error(err);
        if (missingStakes(m, ledger).length > 0) throw new Error('Todos precisam casar antes da rodada.');
        append(matchId, { type: 'round', id: uid(), at: now(), winnerId, fled });
      },
      addPact(matchId, playerIds) {
        const m = findMatch(matchId);
        const err = validatePact(m, computeState(m), playerIds);
        if (err) throw new Error(err);
        append(matchId, { type: 'pact', id: uid(), at: now(), playerIds });
      },
      joinMatch(matchId, playerId, points) {
        const err = canJoin(computeState(findMatch(matchId)), playerId);
        if (err) throw new Error(err);
        // Senta logo antes de quem vai dar as cartas: a vez de dar e de ser mão segue igual.
        const seatBefore = computeState(findMatch(matchId)).dealerId;
        append(matchId, { type: 'join', id: uid(), at: now(), playerId, points, seatBefore });
      },
      undo(matchId) {
        const m = findMatch(matchId);
        const last = lastUndoable(m);
        if (!last) return;
        // Desfazer a rodada final cancela o pagamento do prêmio; desfazer uma entrada devolve o que a pessoa casou.
        if (m.paidOutAt) removeEntries(isPayout(matchId));
        if (last.type === 'join') removeEntries((e) => e.matchId === matchId && e.kind === 'stake' && e.playerId === last.playerId);
        putMatch({ ...m, paidOutAt: undefined, events: m.events.slice(0, -1) });
      },
      deleteMatch(matchId) {
        // Descartar devolve o que foi casado ao crédito de cada um; o dinheiro entregue continua como crédito.
        removeEntries((e) => e.matchId === matchId);
        setMatches((list) => list.filter((x) => x.id !== matchId));
        void repo.deleteMatch(matchId);
      },
      ledger,
      stake(matchId, playerId, depositCents) {
        const m = findMatch(matchId);
        const err = validateStake(m, ledger, playerId, depositCents);
        if (err) throw new Error(err);
        const entries = [];
        if (depositCents > 0) entries.push(newEntry({ playerId, kind: 'deposit', amountCents: depositCents }));
        entries.push(newEntry({ playerId, kind: 'stake', amountCents: m.stakeCents!, matchId }));
        addEntries(entries);
      },
      deposit(playerId, cents) {
        if (cents <= 0) throw new Error('Valor inválido.');
        addEntries([newEntry({ playerId, kind: 'deposit', amountCents: cents })]);
      },
      withdraw(playerId, cents) {
        const err = validateWithdraw(ledger, playerId, cents);
        if (err) throw new Error(err);
        addEntries([newEntry({ playerId, kind: 'withdraw', amountCents: cents })]);
      },
      payOut(matchId, cashCents) {
        const m = findMatch(matchId);
        if (m.paidOutAt || !m.finishedAt) return;
        addEntries(payoutEntries(m, cashCents, newEntry));
        putMatch({ ...m, paidOutAt: now() });
      },
      removeLedgerEntry(id) {
        removeEntries((e) => e.id === id);
      },
      exportBackup: () => repo.exportAll(),
      async importBackup(backup) {
        await repo.importAll(backup);
        await reload();
      },
    };
  }, [loaded, players, matches, ledger, repo, reload]);

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

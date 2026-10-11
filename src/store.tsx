import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { missingStakes, payoutEntries, validateStake, validateWithdraw, type LedgerEntry } from './domain/ledger';
import { isValidStake, validatePact, validateSplit } from './domain/money';
import { START_POINTS, canJoin, computeState, lastUndoable, validateFinish, validateStart } from './domain/rules';
import { closePlan, legacyEvent, openEvent } from './domain/events';
import type { GameEvent, Match, MatchEvent, Player, PrizeShare } from './domain/types';
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
  /** Fim da preparação: quem fugiu perde o ponto agora e o resto da mesa joga a rodada. */
  startRound(matchId: string, fled: string[]): void;
  /** Fim da execução: o vencedor mantém os pontos e quem jogou e perdeu perde 2. */
  finishRound(matchId: string, winnerId: string): void;
  joinMatch(matchId: string, playerId: string, points: number): void;
  undo(matchId: string): void;
  deleteMatch(matchId: string): void;
  ledger: LedgerEntry[];
  /** Casar: usa o crédito e, se precisar, o dinheiro entregue na hora (o excesso vira crédito). */
  stake(matchId: string, playerId: string, depositCents: number): void;
  deposit(playerId: string, cents: number): void;
  withdraw(playerId: string, cents: number): void;
  /** Paga o prêmio: `cashCents` sai em dinheiro, o resto do prêmio fica de crédito. */
  /** Paga o prêmio: para cada vencedor, `cash[id]` sai em dinheiro e o resto do prêmio dele fica de crédito. */
  payOut(matchId: string, cash: Record<string, number>): void;
  /** Os dois que sobraram racham o prêmio, cada um com a parte combinada. A partida termina. */
  splitPrize(matchId: string, shares: PrizeShare[]): void;
  removeLedgerEntry(id: string): void;
  exportBackup(): Promise<Backup>;
  importBackup(backup: Backup): Promise<void>;
  events: GameEvent[];
  /** Evento aberto agora: partidas e movimentos de caixa novos ficam nele. */
  currentEvent?: GameEvent;
  /** Abre um evento novo (o caixa nasce zerado). Só depois de encerrar o anterior. */
  startEvent(name: string): GameEvent;
  /** Encerra o evento aberto: paga em dinheiro o crédito que sobrou para cada um e zera o caixa. */
  endEvent(): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, repo = localRepository }: { children: ReactNode; repo?: Repository }) {
  const [loaded, setLoaded] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);

  const reload = useCallback(async () => {
    const [p, m, l, ev] = await Promise.all([repo.listPlayers(), repo.listMatches(), repo.listLedger(), repo.listEvents()]);
    // Dados de antes dos eventos viram o "Evento 1", aberto, para nada ficar sem evento. O id é fixo
    // para a migração ser idempotente: se a carga rodar duas vezes seguidas, grava o mesmo evento.
    const legacy = ev.length === 0 ? legacyEvent(m, l, 'evento-1') : undefined;
    if (legacy) await repo.saveEvent(legacy);
    setPlayers(p);
    setMatches(m);
    setLedger(l);
    setEvents(legacy ? [legacy] : ev);
    setLoaded(true);
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const store = useMemo<Store>(() => {
    const current = openEvent(events);
    const requireEvent = () => {
      if (!current) throw new Error('Abra um evento antes.');
      return current;
    };
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

    // Todo movimento de caixa fica no evento aberto (ou no da partida, se for de uma partida).
    const newEntry = (e: Omit<LedgerEntry, 'id' | 'at'>): LedgerEntry => {
      const eventId = (e.matchId && matches.find((m) => m.id === e.matchId)?.eventId) || current?.id;
      return { ...e, eventId, id: uid(), at: now() };
    };

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
        if (!isValidStake(stakeCents)) throw new Error('O valor casado precisa ser múltiplo de R$ 10,00.');
        const at = now();
        const m: Match = {
          id: uid(),
          createdAt: at,
          eventId: requireEvent().id,
          firstDealerId,
          cashierId,
          stakeCents,
          events: playerIds.map((playerId) => ({ type: 'join', id: uid(), at, playerId, points: START_POINTS })),
        };
        putMatch(m);
        return m;
      },
      startRound(matchId, fled) {
        const m = findMatch(matchId);
        const err = validateStart(computeState(m), { fled });
        if (err) throw new Error(err);
        if (missingStakes(m, ledger).length > 0) throw new Error('Todos precisam casar antes da rodada.');
        append(matchId, { type: 'start', id: uid(), at: now(), fled });
      },
      finishRound(matchId, winnerId) {
        const state = computeState(findMatch(matchId));
        const err = validateFinish(state, winnerId);
        if (err) throw new Error(err);
        // O evento de fim repete quem fugiu: histórico e estatísticas leem a rodada inteira dele.
        append(matchId, { type: 'round', id: uid(), at: now(), winnerId, fled: state.current!.fled });
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
        if (depositCents > 0) entries.push(newEntry({ playerId, kind: 'deposit', amountCents: depositCents, refMatchId: matchId }));
        entries.push(newEntry({ playerId, kind: 'stake', amountCents: m.stakeCents!, matchId }));
        addEntries(entries);
      },
      deposit(playerId, cents) {
        requireEvent();
        if (cents <= 0) throw new Error('Valor inválido.');
        addEntries([newEntry({ playerId, kind: 'deposit', amountCents: cents })]);
      },
      withdraw(playerId, cents) {
        const err = validateWithdraw(ledger, playerId, cents);
        if (err) throw new Error(err);
        addEntries([newEntry({ playerId, kind: 'withdraw', amountCents: cents })]);
      },
      splitPrize(matchId, shares) {
        const m = findMatch(matchId);
        const err = validateSplit(m, computeState(m), shares);
        if (err) throw new Error(err);
        append(matchId, { type: 'split', id: uid(), at: now(), shares });
      },
      payOut(matchId, cash) {
        const m = findMatch(matchId);
        if (m.paidOutAt || !m.finishedAt) return;
        addEntries(payoutEntries(m, cash, newEntry));
        putMatch({ ...m, paidOutAt: now() });
      },
      removeLedgerEntry(id) {
        removeEntries((e) => e.id === id);
      },
      events,
      currentEvent: current,
      startEvent(name) {
        if (current) throw new Error('Encerre o evento aberto antes de abrir outro.');
        const ev: GameEvent = { id: uid(), name: name.trim() || 'Evento', startedAt: now() };
        setEvents((list) => [...list, ev]);
        void repo.saveEvent(ev);
        return ev;
      },
      endEvent() {
        const ev = requireEvent();
        const plan = closePlan(ledger, matches, events, ev);
        if (plan.blockers.length > 0) throw new Error(plan.blockers[0]);
        // O crédito que sobrou é pago em dinheiro a cada um, no mesmo instante do encerramento.
        const at = now();
        addEntries(plan.payouts.map((p) => ({ id: uid(), at, playerId: p.playerId, kind: 'withdraw', amountCents: p.cents, eventId: ev.id })));
        const closed = { ...ev, endedAt: at };
        setEvents((list) => list.map((x) => (x.id === ev.id ? closed : x)));
        void repo.saveEvent(closed);
      },
      exportBackup: () => repo.exportAll(),
      async importBackup(backup) {
        await repo.importAll(backup);
        await reload();
      },
    };
  }, [loaded, players, matches, ledger, events, repo, reload]);

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

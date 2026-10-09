import type { LedgerEntry } from '../domain/ledger';
import type { Match, Player } from '../domain/types';

/**
 * Contrato de persistência. Hoje a implementação é local (no próprio tablet);
 * a versão online só precisa de outra implementação desta interface.
 */
export interface Repository {
  listPlayers(): Promise<Player[]>;
  savePlayer(player: Player): Promise<void>;
  listMatches(): Promise<Match[]>;
  saveMatch(match: Match): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  listLedger(): Promise<LedgerEntry[]>;
  addLedger(entries: LedgerEntry[]): Promise<void>;
  removeLedger(ids: string[]): Promise<void>;
  exportAll(): Promise<Backup>;
  importAll(backup: Backup): Promise<void>;
}

export interface Backup {
  version: 1;
  exportedAt: string;
  players: Player[];
  matches: Match[];
  /** Movimentos do caixa. Backups antigos não têm. */
  ledger?: LedgerEntry[];
}

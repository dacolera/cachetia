import type { LedgerEntry } from '../domain/ledger';
import type { Match, Player } from '../domain/types';
import type { Backup, Repository } from './repository';

const KEY = 'cacheta:v1';

interface Data {
  players: Player[];
  matches: Match[];
  ledger: LedgerEntry[];
}

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Data>;
      return { players: data.players ?? [], matches: data.matches ?? [], ledger: data.ledger ?? [] };
    }
  } catch {
    // dado corrompido ou storage indisponível: começa vazio
  }
  return { players: [], matches: [], ledger: [] };
}

function persist(data: Data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

export const localRepository: Repository = {
  async listPlayers() {
    return load().players;
  },
  async savePlayer(player) {
    const data = load();
    persist({ ...data, players: upsert(data.players, player) });
  },
  async listMatches() {
    return load().matches;
  },
  async saveMatch(match) {
    const data = load();
    persist({ ...data, matches: upsert(data.matches, match) });
  },
  async deleteMatch(id) {
    const data = load();
    persist({ ...data, matches: data.matches.filter((m) => m.id !== id) });
  },
  async listLedger() {
    return load().ledger;
  },
  async addLedger(entries) {
    const data = load();
    persist({ ...data, ledger: [...data.ledger, ...entries] });
  },
  async removeLedger(ids) {
    const data = load();
    const drop = new Set(ids);
    persist({ ...data, ledger: data.ledger.filter((e) => !drop.has(e.id)) });
  },
  async exportAll(): Promise<Backup> {
    const data = load();
    return { version: 1, exportedAt: new Date().toISOString(), ...data };
  },
  async importAll(backup) {
    if (backup?.version !== 1 || !Array.isArray(backup.players) || !Array.isArray(backup.matches)) {
      throw new Error('Arquivo de backup inválido.');
    }
    persist({ players: backup.players, matches: backup.matches, ledger: backup.ledger ?? [] });
  },
};

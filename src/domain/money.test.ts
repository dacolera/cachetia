import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoney, partnersOf, pot, settle, validatePact } from './money';
import { computeState } from './rules';
import type { Match, MatchEvent } from './types';

let seq = 0;
const join = (playerId: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at: '', playerId, points });
const round = (winnerId: string, fled: string[] = []): MatchEvent => ({ type: 'round', id: `e${seq++}`, at: '', winnerId, fled });
const pact = (...playerIds: string[]): MatchEvent => ({ type: 'pact', id: `e${seq++}`, at: '', playerIds });
const match = (...events: MatchEvent[]): Match => ({ id: 'm', createdAt: '', stakeCents: 1000, events });

describe('pote e acerto', () => {
  it('pote é o valor casado vezes quem sentou, inclusive quem entrou no meio', () => {
    expect(pot(match(join('a'), join('b'), join('c'), round('a'), join('d', 9)))).toBe(4000);
  });

  it('sem livrar: vencedor leva o pote, os outros perdem o que casaram', () => {
    const s = settle(match(join('a', 2), join('b', 2), join('c', 2), round('a')))!;
    expect(s.potCents).toBe(3000);
    expect(s.returnsTo).toEqual([]);
    expect(s.net).toEqual({ a: 2000, b: -1000, c: -1000 });
  });

  it('exemplo: Ana, Beto e Caio livram e a Ana vence', () => {
    const s = settle(match(join('ana', 2), join('beto', 1), join('caio', 1), join('davi', 2), join('eva', 2), pact('ana', 'beto', 'caio'), round('ana')))!;
    expect(s.potCents).toBe(5000);
    expect(s.returnsTo.sort()).toEqual(['beto', 'caio']);
    expect(s.net).toEqual({ ana: 2000, beto: 0, caio: 0, davi: -1000, eva: -1000 });
  });

  it('vence alguém de fora do pacto: ninguém devolve nada', () => {
    const s = settle(match(join('ana', 2), join('beto', 1), join('caio', 2), pact('ana', 'beto'), round('caio')))!;
    expect(s.returnsTo).toEqual([]);
    expect(s.net).toEqual({ ana: -1000, beto: -1000, caio: 2000 });
  });

  it('pactos se sobrepõem: cada dupla vale por si', () => {
    const events = [join('ana', 3), join('beto', 3), join('caio', 3), pact('ana', 'beto'), pact('ana', 'caio')];
    expect(partnersOf(match(...events), 'ana').sort()).toEqual(['beto', 'caio']);
    expect(partnersOf(match(...events), 'caio')).toEqual(['ana']);
    // Caio vence: devolve só para a Ana; Beto perde o que casou.
    const s = settle(match(...events, round('caio'), round('caio')))!;
    expect(s.net).toEqual({ ana: 0, beto: -1000, caio: 1000 });
  });

  it('o mesmo par em dois pactos devolve uma vez só', () => {
    const s = settle(match(join('ana', 2), join('beto', 2), join('caio', 2), pact('ana', 'beto'), pact('ana', 'beto', 'caio'), round('ana')))!;
    expect(s.net).toEqual({ ana: 0, beto: 0, caio: 0 });
  });

  it('a soma de todos os resultados é sempre zero', () => {
    const s = settle(match(join('a', 2), join('b', 1), join('c', 1), join('d', 2), pact('a', 'b'), pact('b', 'c'), round('b')))!;
    expect(Object.values(s.net).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('partida sem valor casado (antiga) não tem acerto', () => {
    const m = { ...match(join('a', 2), join('b', 2), round('a')), stakeCents: undefined };
    expect(settle(m)).toBeUndefined();
  });
});

describe('livrar', () => {
  const m = match(join('a', 2), join('b', 1), join('c', 1), join('d', 0));
  const st = computeState(m);

  it('precisa de pelo menos dois jogadores na mesa', () => {
    expect(validatePact(m, st, ['a'])).toMatch(/dois/);
    expect(validatePact(m, st, ['a', 'd'])).toMatch(/mesa/);
    expect(validatePact(m, st, ['a', 'b', 'c'])).toBeNull();
  });

  it('não repete um pacto que já existe', () => {
    const m2 = match(join('a', 2), join('b', 1), join('c', 1), pact('a', 'b', 'c'));
    expect(validatePact(m2, computeState(m2), ['a', 'b'])).toMatch(/já estão/);
  });

  it('livrar não afeta pontos nem a vez de dar cartas', () => {
    const base = [join('a'), join('b'), join('c'), round('a', ['b'])];
    const with_ = computeState({ ...match(...base, pact('a', 'b')), firstDealerId: 'a' });
    const without = computeState({ ...match(...base), firstDealerId: 'a' });
    expect(with_.standings).toEqual(without.standings);
    expect([with_.dealerId, with_.handId, with_.roundsPlayed]).toEqual([without.dealerId, without.handId, without.roundsPlayed]);
  });
});

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(formatMoney(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });

  it('lê valores digitados', () => {
    expect(parseMoney('10')).toBe(1000);
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('R$ 1.000,00')).toBe(100000);
    expect(parseMoney('0')).toBeUndefined();
    expect(parseMoney('')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { formatMoney, isValidStake, pacts, parseMoney, partnersOf, pot, roundPact, settle, validatePact, validateSplit } from './money';
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

  it('pactos de rodadas diferentes se sobrepõem: cada dupla vale por si', () => {
    // Rodada 1: Caio vence, Ana corre e Beto zera. Rodada 2: Ana e Caio livram.
    const events = [join('ana', 3), join('beto', 2), join('caio', 4), pact('ana', 'beto'), round('caio', ['ana']), pact('ana', 'caio')];
    expect(partnersOf(match(...events), 'ana').sort()).toEqual(['beto', 'caio']);
    expect(partnersOf(match(...events), 'caio')).toEqual(['ana']);
    // Caio vence: devolve só para a Ana; Beto perde o que casou.
    const s = settle(match(...events, round('caio')))!;
    expect(s.net).toEqual({ ana: 0, beto: -1000, caio: 1000 });
  });

  it('pactos de grupos diferentes são independentes', () => {
    const events = [join('ana', 2), join('beto', 1), join('caio', 2), join('davi', 1), pact('ana', 'beto'), round('ana', ['caio'])];
    // Rodada 2: Caio e Davi fazem o próprio pacto, sem entrar no de Ana e Beto.
    const later = [...events, pact('caio', 'davi')];
    expect(partnersOf(match(...later), 'ana')).toEqual(['beto']);
    expect(partnersOf(match(...later), 'caio')).toEqual(['davi']);
  });

  it('um pacto de outra rodada com alguém em comum não liga os outros entre si', () => {
    // Ana e Beto livram; na rodada seguinte Beto e Caio livram. Ana e Caio não ficam ligados.
    const events = [join('ana', 2), join('beto', 3), join('caio', 4), pact('ana', 'beto'), round('caio', ['beto']), pact('beto', 'caio')];
    expect(partnersOf(match(...events), 'ana')).toEqual(['beto']);
    expect(partnersOf(match(...events), 'caio')).toEqual(['beto']);
    expect(partnersOf(match(...events), 'beto').sort()).toEqual(['ana', 'caio']);
    // Caio vence: devolve só ao Beto; a Ana perde o que casou.
    const s = settle(match(...events, round('caio')))!;
    expect(s.net).toEqual({ ana: -1000, beto: 0, caio: 1000 });
  });

  it('o mesmo par em dois pactos devolve uma vez só', () => {
    const s = settle(match(join('ana', 2), join('beto', 2), join('caio', 2), pact('ana', 'beto'), pact('ana', 'beto', 'caio'), round('ana')))!;
    expect(s.net).toEqual({ ana: 0, beto: 0, caio: 0 });
  });

  it('na mesma rodada, quem livra depois se soma ao pacto: igual a todos livrarem de uma vez', () => {
    const table = [join('ana', 2), join('caio', 2), join('duda', 2), join('edu', 2)];
    // Caio e Duda livram; segundos depois a Ana entra escolhendo só ela.
    const twoSteps = [...table, pact('caio', 'duda'), pact('ana')];
    const oneStep = [...table, pact('ana', 'caio', 'duda')];
    for (const id of ['ana', 'caio', 'duda', 'edu']) {
      expect(partnersOf(match(...twoSteps), id).sort()).toEqual(partnersOf(match(...oneStep), id).sort());
    }
    // Qualquer vencedor (a rodada final elimina os outros três): o acerto é o mesmo nos dois jeitos.
    for (const winner of ['ana', 'caio', 'duda', 'edu']) {
      const a = settle(match(...twoSteps, round(winner)))!;
      const b = settle(match(...oneStep, round(winner)))!;
      expect(a.net).toEqual(b.net);
      expect(a.returnsTo.sort()).toEqual(b.returnsTo.sort());
    }
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

  it('não repete, numa rodada nova, um pacto que já existe', () => {
    const m2 = match(join('a', 3), join('b', 3), join('c', 3), pact('a', 'b', 'c'), round('a'));
    expect(validatePact(m2, computeState(m2), ['a', 'b'])).toMatch(/já estão/);
  });

  it('com pacto na rodada, basta escolher quem entra; quem já está não pode ser escolhido', () => {
    const m2 = match(join('a', 3), join('b', 3), join('c', 3), join('d', 3), pact('b', 'c'));
    const st2 = computeState(m2);
    expect(validatePact(m2, st2, ['a'])).toBeNull();
    expect(validatePact(m2, st2, ['a', 'b'])).toMatch(/já está livrando/);
    expect(validatePact(m2, st2, [])).not.toBeNull();
  });

  it('pactos da mesma rodada viram um só; a rodada seguinte começa sem pacto', () => {
    const m2 = match(join('a', 3), join('b', 3), join('c', 3), join('d', 3), pact('b', 'c'), pact('a'));
    expect(pacts(m2)).toEqual([{ playerIds: ['b', 'c', 'a'], round: 1 }]);
    expect(roundPact(m2)?.playerIds).toEqual(['b', 'c', 'a']);
    expect(roundPact(match(...m2.events, round('d')))).toBeUndefined();
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
  it('valor casado é sempre múltiplo de R$ 10,00', () => {
    expect([1000, 2000, 15000].every(isValidStake)).toBe(true);
    expect([0, 500, 1250, -1000].some(isValidStake)).toBe(false);
  });

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

describe('rachar o prêmio', () => {
  const split = (...shares: [string, number][]): MatchEvent => ({ type: 'split', id: `e${seq++}`, at: '', shares: shares.map(([playerId, cents]) => ({ playerId, cents })) });
  // a e b sobraram; c e d já saíram. Pote de R$ 40.
  const base = [join('a', 3), join('b', 3), join('c', 1), join('d', 1), round('a')];

  it('termina a partida sem vencedor único e divide o pote', () => {
    const m = match(...base, split(['a', 2000], ['b', 2000]));
    const st = computeState(m);
    expect([st.finished, st.winnerId]).toEqual([true, undefined]);
    expect(settle(m)?.net).toEqual({ a: 1000, b: 1000, c: -1000, d: -1000 });
  });

  it('dá para combinar um racha diferente da metade', () => {
    expect(settle(match(...base, split(['a', 2500], ['b', 1500])))?.net).toEqual({ a: 1500, b: 500, c: -1000, d: -1000 });
  });

  it('quem livrou com qualquer um dos dois recebe o valor casado de volta uma vez só, antes de rachar', () => {
    const withPacts = [join('a', 3), join('b', 3), join('c', 1), join('d', 1), pact('a', 'c'), pact('b', 'c'), round('a')];
    const m = match(...withPacts);
    expect(validateSplit(m, computeState(m), [{ playerId: 'a', cents: 1500 }, { playerId: 'b', cents: 1500 }])).toBeNull();
    expect(validateSplit(m, computeState(m), [{ playerId: 'a', cents: 2000 }, { playerId: 'b', cents: 2000 }])).toMatch(/somar/);
    const s = settle(match(...withPacts, split(['a', 1500], ['b', 1500])))!;
    expect(s.returnsTo).toEqual(['c']);
    expect(s.net).toEqual({ a: 500, b: 500, c: 0, d: -1000 });
    expect(Object.values(s.net).reduce((x, y) => x + y, 0)).toBe(0);
  });

  it('só com dois na mesa e fora de uma rodada em jogo', () => {
    const three = match(join('a'), join('b'), join('c'));
    expect(validateSplit(three, computeState(three), [{ playerId: 'a', cents: 1500 }, { playerId: 'b', cents: 1500 }])).toMatch(/dois/);
    const inRound = match(join('a'), join('b'), { type: 'start', id: 'x', at: '', fled: [] });
    expect(validateSplit(inRound, computeState(inRound), [{ playerId: 'a', cents: 1000 }, { playerId: 'b', cents: 1000 }])).toMatch(/rodada/);
  });
});

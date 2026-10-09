import { describe, expect, it } from 'vitest';
import { canJoin, computeState, joinPoints, lastUndoable, previewRound, validateRound } from './rules';
import type { Match, MatchEvent } from './types';

let seq = 0;
const join = (playerId: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at: '', playerId, points });
const round = (winnerId: string, fled: string[] = []): MatchEvent => ({ type: 'round', id: `e${seq++}`, at: '', winnerId, fled });
const match = (...events: MatchEvent[]): Match => ({ id: 'm', createdAt: '', events });
const points = (m: Match) => Object.fromEntries(computeState(m).standings.map((s) => [s.playerId, s.points]));

describe('rodada', () => {
  it('vencedor mantém, quem fugiu perde 1 e quem jogou perde 2', () => {
    const m = match(join('a'), join('b'), join('c'), round('a', ['b']));
    expect(points(m)).toEqual({ a: 10, b: 9, c: 8 });
  });

  it('pontuação não fica negativa e quem zera é eliminado', () => {
    const m = match(join('a'), join('b', 1), join('c'), round('a'));
    const st = computeState(m);
    expect(points(m)).toEqual({ a: 10, b: 0, c: 8 });
    expect(st.activeIds).toEqual(['a', 'c']);
    expect(st.standings.find((s) => s.playerId === 'b')?.eliminatedInRound).toBe(1);
  });

  it('eliminado não é mais afetado pelas rodadas seguintes', () => {
    const m = match(join('a'), join('b', 1), join('c'), round('a'), round('c'));
    expect(points(m)).toEqual({ a: 8, b: 0, c: 8 });
  });

  it('termina quando sobra um só jogador com pontos', () => {
    const m = match(join('a', 2), join('b', 2), round('a'));
    const st = computeState(m);
    expect(st.finished).toBe(true);
    expect(st.winnerId).toBe('a');
  });

  it('valida vencedor e fugitivos', () => {
    const st = computeState(match(join('a'), join('b', 1), join('c'), round('a')));
    expect(validateRound(st, { winnerId: 'b', fled: [] })).not.toBeNull();
    expect(validateRound(st, { winnerId: 'a', fled: ['a'] })).not.toBeNull();
    expect(validateRound(st, { winnerId: 'a', fled: ['b'] })).not.toBeNull();
    expect(validateRound(st, { winnerId: 'a', fled: ['c'] })).toBeNull();
  });

  it('quem está de borracha não pode fugir', () => {
    const st = computeState(match(join('a'), join('b', 1), join('c')));
    expect(validateRound(st, { winnerId: 'a', fled: ['b'] })).toMatch(/borracha/);
    expect(validateRound(st, { winnerId: 'a', fled: ['c'] })).toBeNull();
  });

  it('prévia bate com o resultado real', () => {
    const m = match(join('a'), join('b'), join('c', 1));
    expect(previewRound(computeState(m), { a: 'won', b: 'fled', c: 'lost' })).toEqual({ a: 10, b: 9, c: 0 });
  });
});

describe('entrada no meio', () => {
  it('entra como se tivesse fugido de todas as rodadas anteriores', () => {
    expect(joinPoints(computeState(match(join('a'), join('b'))))).toBe(10);
    const m = match(join('a'), join('b'), round('a'), round('a'));
    expect(joinPoints(computeState(m))).toBe(8);
  });

  it('dá pra entrar até a 5ª rodada, com 6 pontos', () => {
    const rounds = (n: number) => Array.from({ length: n }, () => round('a', ['b']));
    const at5 = computeState(match(join('a'), join('b'), ...rounds(4)));
    expect(joinPoints(at5)).toBe(6);
    expect(canJoin(at5, 'z')).toBeNull();
    expect(canJoin(computeState(match(join('a'), join('b'), ...rounds(5))), 'z')).toMatch(/5ª/);
  });

  it('senta no lugar escolhido', () => {
    const m = match(join('a'), join('b'), join('c'), round('a'), { ...join('d', 9), seatAfter: 'a' } as MatchEvent);
    expect(computeState(m).standings.map((s) => s.playerId)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('formação inicial não pode ser desfeita, entrada no meio pode', () => {
    expect(lastUndoable(match(join('a'), join('b')))).toBeUndefined();
    const mid = join('c', 7);
    expect(lastUndoable(match(join('a'), join('b'), round('a'), mid))).toBe(mid);
  });
});

describe('mão e quem dá as cartas', () => {
  /** [quem deu, quem foi mão] por rodada, e o par da próxima rodada no fim. */
  const turns = (m: Match) => {
    const st = computeState(m);
    const played = st.dealers.map((d, i) => `${d}>${st.hands[i]}`);
    return st.finished ? played : [...played, `${st.dealerId}>${st.handId}`];
  };

  it('mão é quem está à direita de quem dá, e a vez de ser mão gira pela mesa', () => {
    const m = { ...match(join('a'), join('b'), join('c'), round('a', ['b', 'c']), round('a', ['b', 'c']), round('a', ['b', 'c'])), firstDealerId: 'b' };
    expect(turns(m)).toEqual(['b>c', 'c>a', 'a>b', 'b>c']);
  });

  it('exemplo da família: o mão saiu, quem deu dá de novo para o próximo ser mão', () => {
    // 1 deu, 2 foi mão e foi eliminado: 1 dá de novo e 3 é o mão.
    const m = { ...match(join('j1'), join('j2', 2), join('j3'), round('j1')), firstDealerId: 'j1' };
    expect(turns(m)).toEqual(['j1>j2', 'j1>j3']);
  });

  it('se quem deu saiu, dá as cartas o ativo logo antes do próximo mão', () => {
    const m = { ...match(join('a', 2), join('b'), join('c'), join('d'), round('b')), firstDealerId: 'a' };
    expect(turns(m)).toEqual(['a>b', 'b>c']);
  });

  it('pula quem já saiu na vez de ser mão', () => {
    const m = { ...match(join('a'), join('b'), join('c', 2), join('d'), round('a'), round('a')), firstDealerId: 'a' };
    // rodada 1: a deu, b mão; c saiu. rodada 2: mão seria c, vai para d, quem dá é b.
    expect(turns(m)).toEqual(['a>b', 'b>d', 'd>a']);
  });

  it('quem entra senta antes de quem vai dar: a vez de dar e de ser mão não muda', () => {
    // a deu, b foi mão; na rodada 2 b dá e c é mão. d entra antes de b.
    const base = [join('a'), join('b'), join('c'), round('a', ['b', 'c'])];
    const m = { ...match(...base, { ...join('d', 9), seatBefore: 'b' } as MatchEvent, round('a', ['b', 'c', 'd'])), firstDealerId: 'a' };
    expect(computeState(m).standings.map((s) => s.playerId)).toEqual(['a', 'd', 'b', 'c']);
    // rodada 2: b dá, c é mão; rodada 3: c dá, a é mão; d só é mão quando a vez chegar.
    expect(turns(m)).toEqual(['a>b', 'b>c', 'c>a']);
  });

  it('partida antiga com o lugar no formato antigo continua abrindo', () => {
    const m = match(join('a'), join('b'), round('a'), { ...join('d', 9), seatAfter: 'a' } as MatchEvent);
    expect(computeState(m).standings.map((s) => s.playerId)).toEqual(['a', 'd', 'b']);
  });

  it('sem escolha, começa dando o primeiro da mesa', () => {
    const st = computeState(match(join('a'), join('b')));
    expect([st.dealerId, st.handId]).toEqual(['a', 'b']);
  });

  it('partida terminada não tem próxima vez', () => {
    const st = computeState({ ...match(join('a', 2), join('b', 2), round('a')), firstDealerId: 'b' });
    expect([st.dealerId, st.handId]).toEqual([undefined, undefined]);
  });
});

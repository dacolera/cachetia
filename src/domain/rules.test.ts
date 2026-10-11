import { describe, expect, it } from 'vitest';
import { canJoin, computeState, joinOpen, joinPoints, lastUndoable, leaders, previewRound, validateFinish, validateRound, validateStart } from './rules';
import type { Match, MatchEvent } from './types';

let seq = 0;
const join = (playerId: string, points = 10): MatchEvent => ({ type: 'join', id: `e${seq++}`, at: '', playerId, points });
const round = (winnerId: string, fled: string[] = []): MatchEvent => ({ type: 'round', id: `e${seq++}`, at: '', winnerId, fled });
const start = (fled: string[] = []): MatchEvent => ({ type: 'start', id: `e${seq++}`, at: '', fled });
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

describe('rodada em duas etapas', () => {
  it('ao executar, quem correu já perde 1 e o resto da mesa fica jogando', () => {
    const m = match(join('a'), join('b'), join('c'), start(['b']));
    const st = computeState(m);
    expect(points(m)).toEqual({ a: 10, b: 9, c: 10 });
    expect(st.current).toEqual({ fled: ['b'], playingIds: ['a', 'c'], handId: 'c' });
    expect(st.roundsPlayed).toBe(0);
  });

  it('no fim só quem jogou e perdeu perde 2; quem correu não perde de novo', () => {
    const m = match(join('a'), join('b'), join('c'), start(['b']), round('a', ['b']));
    const st = computeState(m);
    expect(points(m)).toEqual({ a: 10, b: 9, c: 8 });
    expect(st.current).toBeUndefined();
    expect(st.roundsPlayed).toBe(1);
  });

  it('dá o mesmo resultado que a rodada lançada de uma vez (partidas antigas)', () => {
    const two = match(join('a'), join('b'), join('c', 2), start(['b']), round('a', ['b']), start(), round('b'));
    const one = match(join('a'), join('b'), join('c', 2), round('a', ['b']), round('b'));
    expect(computeState(two)).toEqual({ ...computeState(one), current: undefined });
  });

  it('se o mão correu, joga como mão o próximo que ficou; o rodízio segue do mão original', () => {
    // a dá, b é mão. b e c correm: d joga como mão. Na rodada seguinte b dá e c é mão.
    const base = [join('a'), join('b'), join('c'), join('d'), start(['b', 'c'])];
    const m = { ...match(...base), firstDealerId: 'a' };
    expect(computeState(m).current?.handId).toBe('d');
    expect(computeState(m).handId).toBe('b');
    const next = computeState({ ...match(...base, round('a', ['b', 'c'])), firstDealerId: 'a' });
    expect([next.dealerId, next.handId]).toEqual(['b', 'c']);
  });

  it('se o mão não correu, ele mesmo joga como mão', () => {
    const m = { ...match(join('a'), join('b'), join('c'), start(['c'])), firstDealerId: 'a' };
    expect(computeState(m).current?.handId).toBe('b');
  });

  it('valida a preparação', () => {
    const st = computeState(match(join('a'), join('b', 1), join('c')));
    expect(validateStart(st, { fled: ['c'] })).toBeNull();
    expect(validateStart(st, { fled: ['b'] })).toMatch(/borracha/);
    expect(validateStart(st, { fled: ['z'] })).not.toBeNull();
    expect(validateStart(computeState(match(join('a'), join('b'))), { fled: ['a', 'b'] })).toMatch(/ficar/);
    expect(validateStart(computeState(match(join('a'), join('b'), start())), { fled: [] })).toMatch(/andamento/);
  });

  it('o vencedor tem que estar jogando a rodada', () => {
    const st = computeState(match(join('a'), join('b'), join('c'), start(['b'])));
    expect(validateFinish(st, 'a')).toBeNull();
    expect(validateFinish(st, 'b')).not.toBeNull();
    expect(validateFinish(computeState(match(join('a'), join('b'))), 'a')).not.toBeNull();
  });

  it('ninguém entra no meio com a rodada em jogo', () => {
    const st = computeState(match(join('a'), join('b'), start()));
    expect(joinOpen(st)).toBe(false);
    expect(canJoin(st, 'z')).toMatch(/andamento/);
  });

  it('conta vitórias, corridas e derrotas de cada um, inclusive a corrida da rodada em jogo', () => {
    const m = match(join('a'), join('b'), join('c', 2), round('a', ['b']), start(['b']));
    const tally = Object.fromEntries(computeState(m).standings.map((s) => [s.playerId, [s.wins, s.fled, s.lost]]));
    // c zerou na 1ª rodada e não conta mais nada depois disso.
    expect(tally).toEqual({ a: [1, 0, 0], b: [0, 2, 0], c: [0, 0, 1] });
  });

  it('a execução pode ser desfeita', () => {
    const s = start(['b']);
    expect(lastUndoable(match(join('a'), join('b'), join('c'), s))).toBe(s);
  });
});

describe('líderes', () => {
  it('quem tem mais pontos entre os ativos; empatados, todos', () => {
    expect(leaders(computeState(match(join('a'), join('b'), join('c'), round('a', ['b']))))).toEqual(['a']);
    expect(leaders(computeState(match(join('a'), join('b'), join('c'), round('a', ['b']), round('b', ['a']))))).toEqual(['a', 'b']);
  });

  it('ninguém lidera com todos empatados', () => {
    expect(leaders(computeState(match(join('a'), join('b'))))).toEqual([]);
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

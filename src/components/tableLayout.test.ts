import { describe, expect, it } from 'vitest';
import { fitTable, fromCashier, seatPositions } from './tableLayout';

describe('cadeiras da mesa', () => {
  it('cadeira 0 embaixo no centro, a seguinte à direita dela', () => {
    const [first, second] = seatPositions(4, 400, 200);
    expect(first.x).toBeCloseTo(0);
    expect(first.y).toBeCloseTo(200);
    expect(second.x).toBeGreaterThan(0);
    expect(second.y).toBeLessThan(200);
  });

  it('com 4 cadeiras, a terceira fica em cima no centro', () => {
    const seats = seatPositions(4, 400, 200);
    expect(seats[2].x).toBeCloseTo(0, 0);
    expect(seats[2].y).toBeCloseTo(-200, 0);
  });

  it('espaçamento parecido mesmo com 11 numa mesa larga', () => {
    const s = seatPositions(11, 500, 250);
    const gaps = s.map((p, i) => Math.hypot(p.x - s[(i + 1) % 11].x, p.y - s[(i + 1) % 11].y));
    expect(Math.min(...gaps) / Math.max(...gaps)).toBeGreaterThan(0.85);
  });

  it('gira a ordem a partir do caixa sem mudar o sentido', () => {
    expect(fromCashier(['a', 'b', 'c', 'd'], (x) => x === 'c')).toEqual(['c', 'd', 'a', 'b']);
  });
});

describe('encaixe das cartas', () => {
  const overlap = (w: number, h: number, n: number) => {
    const { seats, cardW, cardH } = fitTable(w, h, n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(seats[i].x - seats[j].x) < cardW && Math.abs(seats[i].y - seats[j].y) < cardH) return true;
    return false;
  };

  it.each([
    [1180, 690],
    [820, 1050],
    [1024, 620],
    [768, 900],
  ])('nenhuma carta sobre outra em %ix%i, de 2 a 11 jogadores', (w, h) => {
    for (let n = 2; n <= 11; n++) expect(overlap(w, h, n)).toBe(false);
  });

  it('cartas de bom tamanho num tablet deitado com 11', () => {
    expect(fitTable(1180, 690, 11).cardW).toBeGreaterThanOrEqual(140);
  });
});

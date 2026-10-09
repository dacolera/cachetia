export interface Point {
  x: number;
  y: number;
}

/**
 * Posições de `n` cadeiras numa elipse de raios `a` (horizontal) e `b` (vertical),
 * centrada em (0, 0) com y crescendo para baixo. A cadeira 0 fica embaixo no centro
 * e as seguintes vão para a direita dela, no sentido anti-horário de quem olha a mesa
 * de cima. O espaçamento é igual ao longo da borda, para não amontoar nas laterais.
 */
export function seatPositions(n: number, a: number, b: number): Point[] {
  if (n <= 0) return [];
  const STEPS = 720;
  const at = (i: number): Point => {
    const t = Math.PI / 2 - (i / STEPS) * 2 * Math.PI;
    return { x: a * Math.cos(t), y: b * Math.sin(t) };
  };

  const cumulative = [0];
  let prev = at(0);
  for (let i = 1; i <= STEPS; i++) {
    const p = at(i);
    cumulative.push(cumulative[i - 1] + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  const total = cumulative[STEPS];

  const seats: Point[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (cumulative[j + 1] < target) j++;
    const span = cumulative[j + 1] - cumulative[j] || 1;
    const p0 = at(j);
    const p1 = at(j + 1);
    const f = (target - cumulative[j]) / span;
    seats.push({ x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f });
  }
  return seats;
}

/** Ordem da mesa girada para o caixa ficar na cadeira 0, preservando o sentido. */
export function fromCashier<T>(seats: T[], isCashier: (s: T) => boolean): T[] {
  const i = seats.findIndex(isCashier);
  return i <= 0 ? seats : [...seats.slice(i), ...seats.slice(0, i)];
}

export interface TableFit {
  cardW: number;
  cardH: number;
  /** Raios do anel onde ficam os centros das cartas. */
  a: number;
  b: number;
  seats: Point[];
}

/** Proporção altura/largura da carta no pior caso (modo rodada, com os botões). */
export const CARD_RATIO = 1;
const MIN_CARD = 96;
const MAX_CARD = 190;
const GAP = 8;

/** Maior carta que cabe na sala sem que cadeiras vizinhas se sobreponham. */
export function fitTable(w: number, h: number, n: number): TableFit {
  let cardW = Math.round(Math.min(MAX_CARD, w * 0.22, h * 0.26));
  for (;;) {
    const cardH = cardW * CARD_RATIO;
    const b = Math.max(0, h / 2 - cardH / 2 - GAP);
    // Em tela muito larga a mesa não vira uma faixa: limita o quanto ela se alonga.
    const a = Math.max(0, Math.min(w / 2 - cardW / 2 - GAP, b * 1.9));
    const seats = seatPositions(n, a, b);
    const overlaps = seats.some((p, i) => {
      const q = seats[(i + 1) % n];
      return n > 1 && Math.abs(p.x - q.x) < cardW + GAP && Math.abs(p.y - q.y) < cardH + GAP;
    });
    if (!overlaps || cardW <= MIN_CARD) return { cardW, cardH, a, b, seats };
    cardW -= 4;
  }
}

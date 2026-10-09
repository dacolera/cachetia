import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fitTable } from './tableLayout';

interface Props {
  /** Uma cadeira por item, já na ordem da mesa começando pelo caixa. */
  seats: { key: string; content: ReactNode }[];
  center?: ReactNode;
}

const SUITS = [
  { s: '♠', red: false },
  { s: '♥', red: true },
  { s: '♣', red: false },
  { s: '♦', red: true },
];

export function PokerTable({ seats, center }: Props) {
  const roomRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = roomRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = size;
  const { cardW, cardH, a, b, seats: positions } = fitTable(w, h, seats.length);
  // A mesa fica um pouco para dentro do anel de cadeiras: as cartas avançam sobre a borda.
  const ta = Math.max(0, a - cardW * 0.12);
  const tb = Math.max(0, b - cardH * 0.18);

  return (
    <div className="room" ref={roomRef} style={{ '--cw': `${cardW}px` } as CSSProperties}>
      {w > 0 && (
        <>
          <div className="poker-table" style={{ width: ta * 2, height: tb * 2 }}>
            <Felt w={ta * 2} h={tb * 2} />
            <div className="table-center">{center}</div>
          </div>
          {seats.map((seat, i) => (
            <div key={seat.key} className="seat-slot" style={{ left: w / 2 + positions[i].x, top: h / 2 + positions[i].y, width: cardW }}>
              {seat.content}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Desenho do feltro: linha dourada interna e uma volta de naipes. */
function Felt({ w, h }: { w: number; h: number }) {
  const rail = Math.min(w, h) * 0.07;
  const fw = w - rail * 2;
  const fh = h - rail * 2;
  const cx = w / 2;
  const cy = h / 2;
  const ringA = fw / 2 - Math.min(fw, fh) * 0.12;
  const ringB = fh / 2 - Math.min(fw, fh) * 0.12;
  const count = Math.max(16, Math.round((ringA + ringB) / 26)) & ~3;
  const suitSize = Math.max(12, Math.min(fw, fh) * 0.045);

  return (
    <svg className="felt-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <radialGradient id="felt-grad" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#1f7a52" />
          <stop offset="60%" stopColor="#16603f" />
          <stop offset="100%" stopColor="#0d4029" />
        </radialGradient>
        <linearGradient id="rail-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a4a26" />
          <stop offset="50%" stopColor="#4e2c14" />
          <stop offset="100%" stopColor="#2f190a" />
        </linearGradient>
        <pattern id="felt-suits" width="64" height="64" patternUnits="userSpaceOnUse">
          {SUITS.map((s, i) => (
            <text key={i} x={(i % 2) * 32 + 8} y={Math.floor(i / 2) * 32 + 22} fontSize="16" fill="#ffffff" opacity="0.035">
              {s.s}
            </text>
          ))}
        </pattern>
      </defs>

      <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill="url(#rail-grad)" />
      <ellipse cx={cx} cy={cy} rx={w / 2 - 3} ry={h / 2 - 3} fill="none" stroke="#a87442" strokeWidth="2" opacity="0.6" />
      <ellipse cx={cx} cy={cy} rx={fw / 2} ry={fh / 2} fill="url(#felt-grad)" />
      <ellipse cx={cx} cy={cy} rx={fw / 2} ry={fh / 2} fill="url(#felt-suits)" />
      <ellipse cx={cx} cy={cy} rx={fw / 2} ry={fh / 2} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="6" />
      <ellipse cx={cx} cy={cy} rx={ringA + suitSize} ry={ringB + suitSize} fill="none" stroke="#d4ae3a" strokeOpacity="0.45" strokeWidth="2" />

      {Array.from({ length: count }, (_, i) => {
        const t = (i / count) * Math.PI * 2;
        const suit = SUITS[i % 4];
        return (
          <text
            key={i}
            x={cx + ringA * Math.cos(t)}
            y={cy + ringB * Math.sin(t)}
            fontSize={suitSize}
            textAnchor="middle"
            dominantBaseline="central"
            fill={suit.red ? '#e05a4f' : '#0a2a1b'}
            opacity={suit.red ? 0.55 : 0.5}
          >
            {suit.s}
          </text>
        );
      })}
    </svg>
  );
}

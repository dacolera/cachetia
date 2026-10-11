import { formatMoney } from '../domain/money';

/** Cédulas do real a partir de R$ 10 (o pote é sempre múltiplo de R$ 10), em centavos. Imagens em public/notes. */
const NOTES = [20000, 10000, 5000, 2000, 1000] as const;

type Note = (typeof NOTES)[number];

const src = (note: Note) => `/notes/${note / 100}.jpg`;

/** Quebra o valor nas maiores cédulas possíveis. */
export function breakIntoNotes(cents: number): { note: Note; count: number }[] {
  let rest = cents;
  const notes: { note: Note; count: number }[] = [];
  for (const note of NOTES) {
    const count = Math.floor(rest / note);
    if (count > 0) notes.push({ note, count });
    rest -= count * note;
  }
  return notes;
}

/** Pote em cédulas: uma pilha por valor, levemente em leque, com "×N" quando há mais de uma. */
export function Banknotes({ cents }: { cents: number }) {
  const notes = breakIntoNotes(cents);
  return (
    <div className="banknotes" aria-label={`Pote ${formatMoney(cents)}`}>
      <div className="banknotes-fan">
        {notes.map(({ note, count }, i) => {
          const tilt = (i - (notes.length - 1) / 2) * 7;
          return (
            <div key={note} className="note-stack" style={{ transform: `rotate(${tilt}deg)` }}>
              {count > 1 && <img className="note note-under" src={src(note)} alt="" draggable={false} />}
              <img className="note" src={src(note)} alt={formatMoney(note)} draggable={false} />
              {count > 1 && <span className="note-count">×{count}</span>}
            </div>
          );
        })}
      </div>
      <span className="banknotes-total">{formatMoney(cents)}</span>
    </div>
  );
}

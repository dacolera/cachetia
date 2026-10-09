import { formatMoney, settle } from '../domain/money';
import type { Match } from '../domain/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';

/** Acerto do dinheiro de uma partida terminada: pote, devoluções de quem livrou e o resultado de cada um. */
export function SettlementView({ match }: { match: Match }) {
  const store = useStore();
  const s = settle(match);
  if (!s) return null;

  const players = Object.keys(s.net).length;
  const rows = Object.entries(s.net).sort((a, b) => b[1] - a[1]);

  return (
    <div className="settlement">
      <p>
        Pote de <strong>{formatMoney(s.potCents)}</strong> ({players} × {formatMoney(s.stakeCents)}) vai para{' '}
        <strong>{store.playerName(s.winnerId)}</strong>.
      </p>
      {s.returnsTo.length > 0 && (
        <p>
          🤝 Livrou com {s.returnsTo.map((id) => store.playerName(id)).join(', ')}: devolve {formatMoney(s.stakeCents)} para cada um (
          {formatMoney(s.stakeCents * s.returnsTo.length)} no total).
        </p>
      )}
      <ul className="settlement-list">
        {rows.map(([id, cents]) => (
          <li key={id}>
            <span className="who">
              <Avatar player={store.player(id)} size={32} />
              {store.playerName(id)}
            </span>
            <strong className={cents > 0 ? 'money-pos' : cents < 0 ? 'money-neg' : 'money-zero'}>
              {cents > 0 ? '+' : ''}
              {formatMoney(cents)}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

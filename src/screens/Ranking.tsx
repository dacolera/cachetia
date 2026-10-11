import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { TopBar } from '../components/ui';
import { formatMoney } from '../domain/money';
import { moneyRanking, ranking } from '../domain/stats';
import type { Navigate } from '../nav';
import { useStore } from '../store';

export function Ranking({ go }: { go: Navigate }) {
  const store = useStore();
  const [tab, setTab] = useState<'wins' | 'money'>('wins');
  const rows = ranking(store.players, store.matches);

  return (
    <main className="screen">
      <TopBar title="Ranking" onBack={() => go({ name: 'home' })} />
      <div className="ranking-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'wins'} className={tab === 'wins' ? 'chip on' : 'chip'} onClick={() => setTab('wins')}>
          🏆 Vitórias
        </button>
        <button role="tab" aria-selected={tab === 'money'} className={tab === 'money' ? 'chip on' : 'chip'} onClick={() => setTab('money')}>
          💰 Dinheiro ganho
        </button>
      </div>
      {tab === 'money' && <MoneyRanking />}
      {tab === 'wins' && rows.length === 0 && <p className="empty">O ranking aparece depois da primeira partida terminada.</p>}
      {tab === 'wins' && rows.length > 0 && (
        <div className="table-wrap">
          <table className="table ranking">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">Jogador</th>
                <th>Vitórias</th>
                <th>Partidas</th>
                <th>Aproveitamento</th>
                <th>Rodadas ganhas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.player.id}>
                  <td>{r.wins > 0 && i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                  <td className="left">
                    <span className="who">
                      <Avatar player={r.player} size={40} />
                      {r.player.name}
                    </span>
                  </td>
                  <td className="strong">{r.wins}</td>
                  <td>{r.matches}</td>
                  <td>{Math.round(r.winRate * 100)}%</td>
                  <td>{r.roundsWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** Lucro de cada um em todas as partidas com valor casado: o recebido menos o casado. */
function MoneyRanking() {
  const store = useStore();
  const rows = moneyRanking(store.players, store.matches);
  if (rows.length === 0) return <p className="empty">O ranking de dinheiro aparece depois da primeira partida com valor casado terminada.</p>;
  const signed = (cents: number) => (
    <span className={cents > 0 ? 'money-pos' : cents < 0 ? 'money-neg' : 'money-zero'}>
      {cents > 0 ? '+' : ''}
      {formatMoney(cents)}
    </span>
  );
  return (
    <>
      <p className="ranking-note">Lucro = o que recebeu (prêmios, rachas e devoluções do livrar) menos o que casou. Conta todas as partidas terminadas com valor casado.</p>
      <div className="table-wrap">
        <table className="table ranking">
          <thead>
            <tr>
              <th>#</th>
              <th className="left">Jogador</th>
              <th>Lucro</th>
              <th>Recebeu</th>
              <th>Casou</th>
              <th>Partidas</th>
              <th>Melhor partida</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.player.id}>
                <td>{r.netCents > 0 && i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</td>
                <td className="left">
                  <span className="who">
                    <Avatar player={r.player} size={40} />
                    {r.player.name}
                  </span>
                </td>
                <td className="strong">{signed(r.netCents)}</td>
                <td>{formatMoney(r.receivedCents)}</td>
                <td>{formatMoney(r.stakedCents)}</td>
                <td>{r.matches}</td>
                <td>{signed(r.bestCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import { Avatar } from '../components/Avatar';
import { TopBar } from '../components/ui';
import { ranking } from '../domain/stats';
import type { Navigate } from '../nav';
import { useStore } from '../store';

export function Ranking({ go }: { go: Navigate }) {
  const store = useStore();
  const rows = ranking(store.players, store.matches);

  return (
    <main className="screen">
      <TopBar title="Ranking" onBack={() => go({ name: 'home' })} />
      {rows.length === 0 && <p className="empty">O ranking aparece depois da primeira partida terminada.</p>}
      {rows.length > 0 && (
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

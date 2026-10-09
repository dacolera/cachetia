import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PlayerForm } from '../components/PlayerForm';
import { DealerBadge, TopBar } from '../components/ui';
import { MAX_PLAYERS, MIN_PLAYERS, computeState } from '../domain/rules';
import type { Navigate } from '../nav';
import { useStore } from '../store';

/** Partidas terminadas há menos que isso contam como "do mesmo dia" para definir quem dá as cartas. */
const SAME_SESSION_MS = 12 * 60 * 60 * 1000;

export function NewMatch({ go }: { go: Navigate }) {
  const store = useStore();
  const last = [...store.matches].filter((m) => m.finishedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastState = last && computeState(last);
  // A próxima partida começa com a mesa da anterior, cada um no mesmo lugar.
  const lastSeats = lastState
    ? lastState.standings
        .map((s) => s.playerId)
        .filter((id) => !store.player(id)?.archived)
        .slice(0, MAX_PLAYERS)
    : [];
  const sameSession = !!last?.finishedAt && Date.now() - new Date(last.finishedAt).getTime() < SAME_SESSION_MS;
  // Quem ganhou a última partida começa dando as cartas; na primeira do dia, a escolha é livre.
  const lastWinner = sameSession ? lastState?.winnerId : undefined;

  const [selected, setSelected] = useState<string[]>(lastSeats);
  const [dealer, setDealer] = useState<string | null>(lastWinner ?? null);
  const [cashier, setCashier] = useState<string | null>(last?.cashierId ?? null);
  const [creating, setCreating] = useState(false);

  const full = selected.length >= MAX_PLAYERS;
  const players = store.players.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const dealerOk = dealer !== null && selected.includes(dealer);
  // Sem escolha explícita, o caixa é o primeiro da mesa.
  const cashierId = cashier && selected.includes(cashier) ? cashier : selected[0];

  function include(id: string) {
    setSelected((s) => {
      if (s.includes(id) || s.length >= MAX_PLAYERS) return s;
      // Quem já estava na mesa anterior volta pro mesmo lugar, não pro fim.
      const seat = lastSeats.indexOf(id);
      if (seat === -1) return [...s, id];
      const before = s.findIndex((x) => {
        const xs = lastSeats.indexOf(x);
        return xs > seat;
      });
      return before === -1 ? [...s, id] : [...s.slice(0, before), id, ...s.slice(before)];
    });
  }

  function toggle(id: string) {
    if (selected.includes(id)) setSelected((s) => s.filter((x) => x !== id));
    else include(id);
  }


  return (
    <main className="screen">
      <TopBar title="Nova partida" onBack={() => go({ name: 'home' })} />

      <section className="panel">
        <h2>Quem vai jogar?</h2>
        <p className="muted">
          {lastSeats.length > 0
            ? 'Mesma mesa da última partida. Toque para tirar ou incluir alguém; quem volta senta no lugar de antes.'
            : 'Toque nos jogadores seguindo a mesa no sentido anti-horário.'}{' '}
          {selected.length} de {MAX_PLAYERS}.
        </p>

        <div className="player-grid">
          {players.map((p) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} className={on ? 'player-tile on' : 'player-tile'} disabled={!on && full} onClick={() => toggle(p.id)}>
                <Avatar player={p} className="avatar-lg" />
                <span className="player-tile-name">{p.name}</span>
                {on && <span className="tile-check">✓</span>}
              </button>
            );
          })}
          <button className="player-tile add" disabled={full} onClick={() => setCreating(true)}>
            <span className="avatar avatar-lg add-icon">+</span>
            <span className="player-tile-name">Novo jogador</span>
          </button>
        </div>
      </section>

      {selected.length > 0 && (
        <section className="panel">
          <h2>Mesa e quem dá as cartas</h2>
          <p className="muted">
            {lastWinner && selected.includes(lastWinner)
              ? `${store.playerName(lastWinner)} ganhou a última partida e começa dando as cartas.`
              : 'Primeira partida do dia: toque em quem começa dando as cartas.'}{' '}
            O baralho gira no sentido anti-horário, na ordem abaixo.
          </p>
          <ol className="seats">
            {selected.map((id, i) => (
              <li key={id}>
                <button className={dealer === id ? 'seat dealer' : 'seat'} onClick={() => setDealer(id)}>
                  <span className="seat-pos">{i + 1}</span>
                  <Avatar player={store.player(id)} size={36} />
                  <span className="seat-name">{store.playerName(id)}</span>
                  {dealer === id && <DealerBadge compact />}
                </button>
              </li>
            ))}
          </ol>

          <h3>Quem está com o tablet (caixa)?</h3>
          <p className="muted">Fica sempre embaixo, no centro da mesa; os outros vão se sentando à direita dele.</p>
          <div className="chips">
            {selected.map((id) => (
              <button key={id} className={cashierId === id ? 'chip on' : 'chip'} onClick={() => setCashier(id)}>
                <Avatar player={store.player(id)} size={34} />
                {store.playerName(id)}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="bottombar">
        <button
          className="btn primary big"
          disabled={selected.length < MIN_PLAYERS || !dealerOk}
          onClick={() => go({ name: 'match', id: store.startMatch(selected, dealer!, cashierId).id })}
        >
          {selected.length < MIN_PLAYERS
            ? `Escolha pelo menos ${MIN_PLAYERS}`
            : !dealerOk
              ? 'Escolha quem dá as cartas'
              : `Começar com ${selected.length} jogadores`}
        </button>
      </div>
      {creating && <PlayerForm onClose={() => setCreating(false)} onSaved={(p) => include(p.id)} />}
    </main>
  );
}


import { useState } from 'react';
import { Modal, TopBar } from '../components/ui';
import { computeState } from '../domain/rules';
import type { Navigate } from '../nav';
import { formatDate, useStore } from '../store';

export function History({ go }: { go: Navigate }) {
  const store = useStore();
  const matches = [...store.matches].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <main className="screen">
      <TopBar title="Histórico" onBack={() => go({ name: 'home' })} />
      {matches.length === 0 && <p className="empty">Nenhuma partida jogada ainda.</p>}
      <ul className="list">
        {matches.map((m) => {
          const st = computeState(m);
          return (
            <li key={m.id}>
              <button className="list-item" onClick={() => go(m.finishedAt ? { name: 'detail', id: m.id } : { name: 'match', id: m.id })}>
                <span className="list-main">
                  {st.winnerId ? <>🏆 {store.playerName(st.winnerId)}</> : <em>Em andamento</em>}
                </span>
                <span className="muted">
                  {formatDate(m.createdAt)} · {st.standings.length} jogadores · {st.roundsPlayed} rodada(s)
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

export function MatchDetail({ go, id }: { go: Navigate; id: string }) {
  const store = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const match = store.matches.find((m) => m.id === id);

  if (!match) {
    return (
      <main className="screen">
        <TopBar title="Partida não encontrada" onBack={() => go({ name: 'history' })} />
      </main>
    );
  }

  const final = computeState(match);
  const playerIds = final.standings.map((s) => s.playerId);

  // Uma linha por rodada, com a pontuação de cada um depois dela.
  const rows: { label: string; dealerId?: string; handId?: string; winnerId?: string; fled: Set<string>; points: Map<string, number> }[] = [];
  const firstRound = match.events.findIndex((e) => e.type === 'round');
  const cuts = [firstRound === -1 ? match.events.length : firstRound];
  match.events.forEach((e, i) => e.type === 'round' && cuts.push(i + 1));
  for (const cut of cuts) {
    const ev = match.events[cut - 1];
    const st = computeState({ events: match.events.slice(0, cut), firstDealerId: match.firstDealerId });
    const isRound = ev?.type === 'round';
    rows.push({
      label: st.roundsPlayed === 0 ? 'Início' : `Rodada ${st.roundsPlayed}`,
      dealerId: isRound ? st.dealers[st.dealers.length - 1] : undefined,
      handId: isRound ? st.hands[st.hands.length - 1] : undefined,
      winnerId: isRound ? ev.winnerId : undefined,
      fled: new Set(isRound ? ev.fled : []),
      points: new Map(st.standings.map((s) => [s.playerId, s.points])),
    });
  }

  return (
    <main className="screen">
      <TopBar title={formatDate(match.createdAt)} onBack={() => go({ name: 'history' })}>
        <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
          Apagar
        </button>
      </TopBar>

      {final.winnerId && (
        <p className="detail-winner">
          🏆 <strong>{store.playerName(final.winnerId)}</strong> venceu em {final.roundsPlayed} rodada(s)
        </p>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th />
              {playerIds.map((pid) => (
                <th key={pid}>{store.playerName(pid)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prev = rows[i - 1];
              return (
                <tr key={i}>
                  <th>
                    {r.label}
                    {r.dealerId && (
                      <small className="dealt">
                        ♠ {store.playerName(r.dealerId)}
                        {r.handId && `, mão ${store.playerName(r.handId)}`}
                      </small>
                    )}
                  </th>
                  {playerIds.map((pid) => {
                    const pts = r.points.get(pid);
                    if (pts === undefined) return <td key={pid} className="na" />;
                    const wasOut = prev?.points.get(pid) === 0;
                    if (wasOut) return <td key={pid} className="na" />;
                    const joined = prev && !prev.points.has(pid);
                    const mark = r.winnerId === pid ? 'win' : r.fled.has(pid) ? 'fled' : '';
                    return (
                      <td key={pid} className={[mark, pts === 0 && 'zero'].filter(Boolean).join(' ')}>
                        {pts}
                        {mark === 'win' && ' ★'}
                        {mark === 'fled' && <small> fugiu</small>}
                        {joined && <small> entrou</small>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmDelete && (
        <Modal
          title="Apagar esta partida?"
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirmDelete(false)}>
                Não
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  store.deleteMatch(match.id);
                  go({ name: 'history' });
                }}
              >
                Sim, apagar
              </button>
            </>
          }
        >
          <p>Ela também sai do ranking. Não dá pra desfazer.</p>
        </Modal>
      )}
    </main>
  );
}

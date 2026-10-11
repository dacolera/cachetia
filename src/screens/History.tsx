import { useState } from 'react';
import { Modal, TopBar } from '../components/ui';
import { RoundsTable } from '../components/RoundsTable';
import { SettlementView } from '../components/SettlementView';
import { formatMoney, pacts, pot, settle } from '../domain/money';
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
                  {st.split ? (
                    <>✂️ {st.split.map((w) => store.playerName(w.playerId)).join(' e ')} racharam</>
                  ) : st.winnerId ? (
                    <>🏆 {store.playerName(st.winnerId)}</>
                  ) : (
                    <em>Em andamento</em>
                  )}
                </span>
                <span className="muted">
                  {formatDate(m.createdAt)} · {st.standings.length} jogadores · {st.roundsPlayed} rodada(s)
                  {pot(m) !== undefined && ` · pote ${formatMoney(pot(m)!)}`}
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

  return (
    <main className="screen">
      <TopBar title={formatDate(match.createdAt)} onBack={() => go({ name: 'history' })}>
        <button className="btn ghost danger-text" onClick={() => setConfirmDelete(true)}>
          Apagar
        </button>
      </TopBar>

      {final.split && (
        <p className="detail-winner">
          ✂️ <strong>{final.split.map((w) => store.playerName(w.playerId)).join(' e ')}</strong> racharam o prêmio depois de {final.roundsPlayed} rodada(s)
        </p>
      )}
      {final.winnerId && (
        <p className="detail-winner">
          🏆 <strong>{store.playerName(final.winnerId)}</strong> venceu em {final.roundsPlayed} rodada(s)
        </p>
      )}

      <RoundsTable match={match} />

      {pacts(match).length > 0 && (
        <section className="panel detail-section">
          <h2>🤝 Livramentos</h2>
          <ul>
            {pacts(match).map((p, i) => (
              <li key={i}>
                Rodada {p.round}: {p.playerIds.map((id) => store.playerName(id)).join(', ')}
              </li>
            ))}
          </ul>
        </section>
      )}

      {match.finishedAt && settle(match) && (
        <section className="panel detail-section paper">
          <h2>💰 Acerto</h2>
          <SettlementView match={match} />
        </section>
      )}

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

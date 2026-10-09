import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PokerTable } from '../components/PokerTable';
import { SettlementView } from '../components/SettlementView';
import { formatMoney, pacts, partnersOf, pot, validatePact } from '../domain/money';
import { fromCashier } from '../components/tableLayout';
import { DealerBadge, HandBadge, Modal, Pips, TopBar } from '../components/ui';
import { canJoin, joinOpen, computeState, isBorracha, joinPoints, lastUndoable, previewRound } from '../domain/rules';
import type { RoundOutcome } from '../domain/types';
import type { Navigate } from '../nav';
import { useStore } from '../store';

const OUTCOME_LABEL: Record<RoundOutcome, string> = { won: 'Ganhou', lost: 'Jogou', fled: 'Fugiu' };

export function MatchScreen({ go, id }: { go: Navigate; id: string }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === id);
  const state = useMemo(() => match && computeState(match), [match]);

  const [outcomes, setOutcomes] = useState<Record<string, RoundOutcome> | null>(null);
  const [joining, setJoining] = useState(false);
  const [livrando, setLivrando] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!match || !state) {
    return (
      <main className="screen">
        <TopBar title="Partida não encontrada" onBack={() => go({ name: 'home' })} />
      </main>
    );
  }

  const inRound = outcomes !== null;
  const winnerId = outcomes && Object.keys(outcomes).find((k) => outcomes[k] === 'won');
  const preview = outcomes ? previewRound(state, outcomes) : null;
  const undoable = lastUndoable(match);
  const potCents = pot(match);
  const inPact = new Set(pacts(match).flatMap((p) => p.playerIds));


  function startRound() {
    setOutcomes(Object.fromEntries(state!.activeIds.map((pid) => [pid, 'lost' as RoundOutcome])));
  }

  function setOutcome(pid: string, o: RoundOutcome) {
    setOutcomes((cur) => {
      if (!cur) return cur;
      const next = { ...cur };
      if (o === 'won') for (const k of Object.keys(next)) if (next[k] === 'won') next[k] = 'lost';
      next[pid] = o;
      return next;
    });
  }

  function confirmRound() {
    if (!outcomes || !winnerId) return;
    store.addRound(match!.id, winnerId, Object.keys(outcomes).filter((k) => outcomes[k] === 'fled'));
    setOutcomes(null);
  }

  return (
    <main className={inRound ? 'screen match in-round' : 'screen match'}>
      <TopBar
        title={inRound ? `Rodada ${state.roundsPlayed + 1}` : state.roundsPlayed === 0 ? 'Partida começando' : `${state.roundsPlayed} rodada(s) jogada(s)`}
        onBack={inRound ? undefined : () => go({ name: 'home' })}
      >
        {!inRound && (
          <>
            <button className="btn ghost" disabled={!undoable} onClick={() => store.undo(match.id)}>
              ↶ Desfazer
            </button>
            <button className="btn ghost" disabled={!joinOpen(state)} onClick={() => setJoining(true)}>
              + Entrar jogador
            </button>
            <button className="btn ghost danger-text" onClick={() => setConfirmDiscard(true)}>
              Descartar
            </button>
          </>
        )}
      </TopBar>

      <PokerTable
        center={
          <>
            <span className="center-suits">
              ♠ <em>♥</em> ♣ <em>♦</em>
            </span>
            <strong className="center-round">{state.finished ? 'Fim de jogo' : `Rodada ${state.roundsPlayed + 1}`}</strong>
            {potCents !== undefined && <span className="center-pot">Pote {formatMoney(potCents)}</span>}
            {inRound ? (
              <>
                <span className="center-hint">{winnerId ? 'Marque quem fugiu. Os demais jogaram e perdem 2.' : 'Quem ganhou a rodada?'}</span>
                <button className="btn primary center-btn" disabled={!winnerId} onClick={confirmRound}>
                  {winnerId ? `Confirmar: ${store.playerName(winnerId)} ganhou` : 'Escolha o vencedor'}
                </button>
                <button className="btn ghost center-cancel" onClick={() => setOutcomes(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              !state.finished && (
                <>
                  {state.dealerId && (
                    <span className="center-dealer">
                      ♠ {store.playerName(state.dealerId)} dá as cartas
                      {state.handId && (
                        <>
                          <br />
                          {store.playerName(state.handId)} é mão
                        </>
                      )}
                    </span>
                  )}
                  <button className="btn primary center-btn" onClick={startRound}>
                    Lançar rodada
                  </button>
                  {state.activeIds.length >= 2 && (
                    <button className="btn ghost center-cancel" onClick={() => setLivrando(true)}>
                      🤝 Livrar
                    </button>
                  )}
                </>
              )
            )}
          </>
        }
        seats={fromCashier(state.standings, (s) => s.playerId === match.cashierId).map((s) => {
          const out = outcomes?.[s.playerId];
          const after = preview?.[s.playerId];
          const eliminated = s.points === 0;
          const isDealer = state.dealerId === s.playerId;
          const isHand = state.handId === s.playerId;
          return {
            key: s.playerId,
            content: (
              <article className={['card', eliminated && 'out', out && `o-${out}`, isDealer && 'is-dealer', isHand && 'is-hand'].filter(Boolean).join(' ')}>
                {isDealer && <DealerBadge />}
                {isHand && <HandBadge />}
                <span className="card-name">{store.playerName(s.playerId)}</span>
                <div className="card-top">
                  <Avatar player={store.player(s.playerId)} className="card-avatar" />
                  <div className="card-points">
                    <span className="points">{s.points}</span>
                    {after !== undefined && after !== s.points && (
                      <span className={after === 0 ? 'after zero' : 'after'}>
                        → {after}
                        {after === 0 && ' sai'}
                      </span>
                    )}
                  </div>
                  {isBorracha(s.points) && after === undefined && <span className="tag borracha">borracha</span>}
                </div>
                <Pips points={after ?? s.points} />

                {eliminated && <span className="card-status">Fora na rodada {s.eliminatedInRound}</span>}
                {!eliminated && !inRound && s.joinedInRound > 0 && <span className="tag">entrou na {s.joinedInRound + 1}ª</span>}
                {!inRound && inPact.has(s.playerId) && <span className="tag pact-tag">🤝 livrando</span>}

                {inRound && !eliminated && (
                  <div className="seg">
                    {(['won', 'lost', 'fled'] as RoundOutcome[]).map((o) => (
                      <button
                        key={o}
                        className={out === o ? `seg-btn on ${o}` : 'seg-btn'}
                        disabled={o === 'fled' && isBorracha(s.points)}
                        onClick={() => setOutcome(s.playerId, o)}
                      >
                        {OUTCOME_LABEL[o]}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ),
          };
        })}
      />

      {state.finished && state.winnerId && (
        <Modal
          title="Fim de jogo!"
          actions={
            <>
              <button className="btn" onClick={() => store.undo(match.id)}>
                ↶ Desfazer última rodada
              </button>
              <button className="btn" onClick={() => go({ name: 'home' })}>
                Início
              </button>
              <button className="btn primary" onClick={() => go({ name: 'new' })}>
                Próxima partida
              </button>
            </>
          }
        >
          <div className="victory">
            <span className="victory-photo">
              <Avatar player={store.player(state.winnerId)} className="avatar-xl" />
              <span className="trophy">🏆</span>
            </span>
            <strong>{store.playerName(state.winnerId)}</strong>
            <span className="muted">
              venceu com {state.standings.find((s) => s.playerId === state.winnerId)?.points} ponto(s) em {state.roundsPlayed} rodada(s)
            </span>
          </div>
          <SettlementView match={match} />
        </Modal>
      )}

      {livrando && <PactModal matchId={match.id} onClose={() => setLivrando(false)} />}

      {joining && <JoinModal matchId={match.id} points={joinPoints(state)} onClose={() => setJoining(false)} />}

      {confirmDiscard && (
        <Modal
          title="Descartar esta partida?"
          onClose={() => setConfirmDiscard(false)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirmDiscard(false)}>
                Não
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  store.deleteMatch(match.id);
                  go({ name: 'home' });
                }}
              >
                Sim, descartar
              </button>
            </>
          }
        >
          <p>Ela será apagada e não entra no histórico nem no ranking.</p>
        </Modal>
      )}
    </main>
  );
}

function JoinModal({ matchId, points, onClose }: { matchId: string; points: number; onClose: () => void }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === matchId)!;
  const state = computeState(match);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const available = store.players.filter((p) => !p.archived && canJoin(state, p.id) === null).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const typed = name.trim();

  function confirm() {
    let pid = selected;
    if (!pid && typed) {
      const existing = store.players.find((p) => p.name.toLowerCase() === typed.toLowerCase());
      if (existing && canJoin(state, existing.id)) return setError(canJoin(state, existing.id));
      if (existing?.archived) store.updatePlayer(existing.id, { archived: false });
      pid = (existing ?? store.addPlayer(typed)).id;
    }
    if (!pid) return;
    store.joinMatch(matchId, pid, points);
    onClose();
  }

  return (
    <Modal
      title="Entrar jogador"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!selected && !typed} onClick={confirm}>
            Entrar com {points} ponto(s)
          </button>
        </>
      }
    >
      <h3>Quem?</h3>
      {available.length > 0 && (
        <div className="chips">
          {available.map((p) => (
            <button
              key={p.id}
              className={selected === p.id ? 'chip on' : 'chip'}
              onClick={() => {
                setSelected(selected === p.id ? null : p.id);
                setName('');
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSelected(null);
        }}
        placeholder="Ou digite o nome de alguém novo"
        maxLength={20}
      />

      {state.dealerId && (
        <p>
          Senta logo antes de <strong>{store.playerName(state.dealerId)}</strong>, que vai dar as cartas nesta rodada.
        </p>
      )}
      <p>
        Entra com <strong>{points}</strong> ponto(s), como se tivesse fugido das {state.roundsPlayed} rodada(s) anteriores.
      </p>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

function PactModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === matchId)!;
  const state = computeState(match);
  const [selected, setSelected] = useState<string[]>([]);
  const existing = pacts(match);
  const error = selected.length >= 2 ? validatePact(match, state, selected) : null;
  const stake = match.stakeCents;

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <Modal
      title="Estamos livrando?"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={selected.length < 2 || !!error}
            onClick={() => {
              store.addPact(matchId, selected);
              onClose();
            }}
          >
            🤝 Livrar ({selected.length})
          </button>
        </>
      }
    >
      <p>
        Toque em quem está livrando. Se um deles vencer a partida, devolve {stake !== undefined ? formatMoney(stake) : 'o valor casado'} para cada
        um dos outros.
      </p>
      <div className="chips">
        {state.standings
          .filter((s) => s.points > 0)
          .map((s) => {
            const partners = partnersOf(match, s.playerId);
            return (
              <button key={s.playerId} className={selected.includes(s.playerId) ? 'chip on' : 'chip'} onClick={() => toggle(s.playerId)}>
                <Avatar player={store.player(s.playerId)} size={34} />
                {store.playerName(s.playerId)}
                <small className="chip-sub">{s.points} pt{partners.length > 0 ? ' · 🤝' : ''}</small>
              </button>
            );
          })}
      </div>
      {error && <p className="error">{error}</p>}
      {existing.length > 0 && (
        <div className="pact-list">
          <h3>Já livrando nesta partida</h3>
          <ul>
            {existing.map((p, i) => (
              <li key={i}>
                Rodada {p.round}: {p.playerIds.map((id) => store.playerName(id)).join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

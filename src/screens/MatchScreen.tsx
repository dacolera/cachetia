import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Banknotes } from '../components/Banknotes';
import { MatchLog } from '../components/MatchLog';
import { EventCashModal } from '../components/EventModals';
import { PokerTable } from '../components/PokerTable';
import { SettlementView } from '../components/SettlementView';
import { PayPlayerModal, StakeModal } from '../components/CashModals';
import { PayoutPanel } from '../components/PayoutPanel';
import { balanceOf, balances, cashInBox, hasPot, missingStakes } from '../domain/ledger';
import { formatMoney, pacts, parseMoney, pot, prizeFor, roundPact, validatePact, validateSplit } from '../domain/money';
import { fromCashier } from '../components/tableLayout';
import { DealerBadge, HandBadge, Modal, Tally, TopBar } from '../components/ui';
import { canJoin, joinOpen, computeState, isBorracha, joinPoints, lastUndoable, leaders, previewRound } from '../domain/rules';
import type { Navigate } from '../nav';
import { useStore } from '../store';

export function MatchScreen({ go, id }: { go: Navigate; id: string }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === id);
  const state = useMemo(() => match && computeState(match), [match]);

  /** Preparação da rodada: quem fugiu (ainda não confirmado). `null` fora da preparação. */
  const [fled, setFled] = useState<string[] | null>(null);
  /** Execução da rodada: vencedor escolhido (ainda não confirmado). */
  const [winner, setWinner] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [livrando, setLivrando] = useState(false);
  const [staking, setStaking] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showDay, setShowDay] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const canSplit = !state?.finished && !state?.current && state?.activeIds.length === 2 && match?.stakeCents !== undefined;

  if (!match || !state) {
    return (
      <main className="screen">
        <TopBar title="Partida não encontrada" onBack={() => go({ name: 'home' })} />
      </main>
    );
  }

  const current = state.current;
  const preparing = fled !== null && !current;
  const inRound = preparing || !!current;
  // Se só um ficou no jogo, ele é o vencedor da rodada.
  const winnerId = current ? (current.playingIds.length === 1 ? current.playingIds[0] : current.playingIds.includes(winner ?? '') ? winner : null) : null;
  // Na preparação a prévia mostra só o ponto de quem correu; quem joga só muda no fim da rodada.
  const preview = preparing
    ? Object.fromEntries(Object.entries(previewRound(state, Object.fromEntries(fled.map((pid) => [pid, 'fled' as const])))).filter(([pid]) => fled.includes(pid)))
    : current && winnerId
      ? previewRound(state, Object.fromEntries([...current.fled.map((pid) => [pid, 'won' as const]), [winnerId, 'won' as const]]))
      : null;
  const undoable = lastUndoable(match);
  const potCents = pot(match);
  const leaderIds = state.finished ? [] : leaders(state);
  const inPact = new Set(pacts(match).flatMap((p) => p.playerIds));
  const missing = missingStakes(match, store.ledger);
  const seatedCount = state.standings.length;
  const withPot = hasPot(store.ledger, match);
  const needsPayout = state.finished && withPot && !match.paidOutAt;


  function toggleFled(pid: string) {
    setFled((cur) => cur && (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));
  }

  function executeRound() {
    if (!fled) return;
    store.startRound(match!.id, fled);
    setFled(null);
    setWinner(null);
  }

  /** Desfaz a execução e volta para a preparação com as mesmas marcações. */
  function backToPreparation() {
    if (!current) return;
    setFled(current.fled);
    setWinner(null);
    store.undo(match!.id);
  }

  function confirmRound() {
    if (!winnerId) return;
    store.finishRound(match!.id, winnerId);
    setWinner(null);
  }

  return (
    <main className={inRound ? 'screen match in-round' : 'screen match'}>
      <TopBar
        title={
          preparing
            ? `Rodada ${state.roundsPlayed + 1}: preparação`
            : current
              ? `Rodada ${state.roundsPlayed + 1}: em jogo`
              : state.roundsPlayed === 0
                ? 'Partida começando'
                : `${state.roundsPlayed} rodada(s) jogada(s)`
        }
        onBack={preparing ? undefined : () => go({ name: 'home' })}
      >
        <button className="btn ghost" onClick={() => setShowLog(true)}>
          📜 Memória
        </button>
        {!preparing && (
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
        corner={
          <>
            <button className="bank-cash" title="Dinheiro vivo que o banco precisa ter na caixa. Toque para ver o caixa do evento." onClick={() => setShowDay(true)}>
              <span className="bank-cash-label">💵 Banco em dinheiro</span>
              <strong className="bank-cash-value">{formatMoney(cashInBox(store.ledger))}</strong>
            </button>
            <button
              className="bank-cash"
              title="Soma do crédito de todos os jogadores (o dinheiro menos o que está casado em potes ainda não pagos). Toque para ver o caixa do evento."
              onClick={() => setShowDay(true)}
            >
              <span className="bank-cash-label">💰 Total no caixa</span>
              <strong className="bank-cash-value">{formatMoney([...balances(store.ledger).values()].reduce((a, b) => a + b, 0))}</strong>
            </button>
            <button className="btn bank-pay" onClick={() => setShowDay(true)}>
              🗓️ Caixa do evento
            </button>
            <button className="btn bank-pay" onClick={() => setPaying(true)}>
              📤 Pagar jogador
            </button>
          </>
        }
        center={
          <>
            <span className="center-suits">
              ♠ <em>♥</em> ♣ <em>♦</em>
            </span>
            <strong className="center-round">{state.finished ? 'Fim de jogo' : `Rodada ${state.roundsPlayed + 1}`}</strong>
            {potCents !== undefined && potCents > 0 && <Banknotes cents={potCents} />}
            {potCents !== undefined && missing.length > 0 && (
              <span className="center-pot">
                casaram {seatedCount - missing.length} de {seatedCount}
              </span>
            )}
            {preparing ? (
              <>
                <span className="center-hint">Quem correu? Marque e execute a rodada.</span>
                <button className="btn primary center-btn" disabled={fled.length >= state.activeIds.length} onClick={executeRound}>
                  ▶ Executar ({state.activeIds.length - fled.length} no jogo)
                </button>
                <div className="center-actions">
                  <button className="btn center-secondary" onClick={() => setFled(null)}>
                    ✕ Cancelar
                  </button>
                  {state.activeIds.length >= 2 && (
                    <button className="btn center-secondary" onClick={() => setLivrando(true)}>
                      🤝 Livrar
                    </button>
                  )}
                  {canSplit && (
                    <button className="btn center-secondary" onClick={() => setSplitting(true)}>
                      ✂️ Rachar
                    </button>
                  )}
                </div>
              </>
            ) : current ? (
              <>
                {current.handId && (
                  <span className="center-dealer">
                    {current.handId !== state.handId && state.handId ? `${store.playerName(state.handId)} correu: ` : ''}
                    {store.playerName(current.handId)} é mão
                  </span>
                )}
                <span className="center-hint">{winnerId ? 'Os demais que jogaram perdem 2.' : 'Rodada em jogo. Quem ganhou?'}</span>
                <button className="btn primary center-btn" disabled={!winnerId} onClick={confirmRound}>
                  {winnerId ? `Confirmar: ${store.playerName(winnerId)} ganhou` : 'Toque no vencedor'}
                </button>
                <div className="center-actions">
                  <button className="btn center-secondary" onClick={backToPreparation}>
                    ↶ Voltar à preparação
                  </button>
                </div>
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
                  {missing.length > 0 ? (
                    <>
                      <span className="center-hint">Falta casar: {missing.map((id) => store.playerName(id)).join(', ')}</span>
                      <button className="btn primary center-btn" onClick={() => setStaking(missing[0])}>
                        💵 Casar: {store.playerName(missing[0])}
                      </button>
                    </>
                  ) : (
                    <button className="btn primary center-btn" onClick={() => setFled([])}>
                      ♠ Iniciar rodada
                    </button>
                  )}
                  {state.activeIds.length >= 2 && (
                    <div className="center-actions">
                      <button className="btn center-secondary" onClick={() => setLivrando(true)}>
                        🤝 Livrar
                      </button>
                      {canSplit && (
                        <button className="btn center-secondary" onClick={() => setSplitting(true)}>
                          ✂️ Rachar prêmio
                        </button>
                      )}
                    </div>
                  )}
                </>
              )
            )}
          </>
        }
        seats={fromCashier(state.standings, (s) => s.playerId === match.cashierId).map((s) => {
          const ranOff = (preparing ? fled : current?.fled)?.includes(s.playerId);
          const playing = current?.playingIds.includes(s.playerId);
          const out = ranOff ? 'fled' : winnerId === s.playerId ? 'won' : undefined;
          const after = preview?.[s.playerId];
          const eliminated = s.points === 0;
          const isDealer = state.dealerId === s.playerId;
          // Na execução, se o mão correu, o selo passa para quem joga como mão.
          const isHand = (current ? current.handId : state.handId) === s.playerId;
          return {
            key: s.playerId,
            content: (
              <article
                className={['card', eliminated && 'out', out && `o-${out}`, isDealer && 'is-dealer', isHand && 'is-hand', leaderIds.includes(s.playerId) && 'leader', playing && 'playing', current && ranOff && 'sat-out']
                  .filter(Boolean)
                  .join(' ')}
              >
                {isDealer && <DealerBadge />}
                {isHand && <HandBadge />}
                {leaderIds.includes(s.playerId) && (
                  <span className="leader-crown" title="Líder">
                    👑
                  </span>
                )}
                {eliminated && <span className="out-badge">fora na {s.eliminatedInRound}ª rodada</span>}
                <div className="card-head">
                  <Avatar player={store.player(s.playerId)} className="card-avatar" />
                  <div className="card-id">
                    <span className="card-name">{store.playerName(s.playerId)}</span>
                    <div className="card-points">
                      <span className="points">{s.points}</span>
                      <span className="points-unit">pts</span>
                      {after !== undefined && after !== s.points && (
                        <span className={after === 0 ? 'after zero' : 'after'}>
                          → {after}
                          {after === 0 && ' sai'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Tally wins={s.wins} fled={s.fled} lost={s.lost} />

                {match.stakeCents !== undefined && (
                  <dl className="card-info">
                    <div>
                      <dt>💰 Caixa</dt>
                      <dd>{formatMoney(balanceOf(store.ledger, s.playerId))}</dd>
                    </div>
                  </dl>
                )}

                <div className="card-tags">
                  {isBorracha(s.points) && after === undefined && <span className="tag borracha">borracha</span>}
                  {!eliminated && !inRound && s.joinedInRound > 0 && <span className="tag">entrou na {s.joinedInRound + 1}ª</span>}
                  {!current && inPact.has(s.playerId) && <span className="tag pact-tag">🤝 livrando</span>}
                  {current && ranOff && <span className="tag fled-tag">correu</span>}
                  {missing.includes(s.playerId) && (
                    <button className="tag stake-tag" onClick={() => setStaking(s.playerId)}>
                      💵 casar
                    </button>
                  )}
                </div>

                {preparing && !eliminated && (
                  <button
                    className={ranOff ? 'run-toggle on' : 'run-toggle'}
                    disabled={isBorracha(s.points)}
                    aria-pressed={!!ranOff}
                    onClick={() => toggleFled(s.playerId)}
                  >
                    🏃 {ranOff ? 'Correu' : 'Correr'}
                  </button>
                )}

                {playing && (
                  <div className="seg seg-1">
                    <button className={winnerId === s.playerId ? 'seg-btn on won' : 'seg-btn'} onClick={() => setWinner(winnerId === s.playerId ? null : s.playerId)}>
                      🏆 Ganhou
                    </button>
                  </div>
                )}
              </article>
            ),
          };
        })}
      />

      {state.finished && (state.winnerId || state.split) && (
        <Modal
          title={state.split ? 'Prêmio rachado!' : 'Fim de jogo!'}
          actions={
            <>
              <button className="btn" onClick={() => store.undo(match.id)}>
                {state.split ? '↶ Desfazer o racha' : '↶ Desfazer última rodada'}
              </button>
              <button className="btn" onClick={() => go({ name: 'home' })}>
                Início
              </button>
              <button className="btn primary" disabled={needsPayout} onClick={() => go({ name: 'new' })}>
                Próxima partida
              </button>
            </>
          }
        >
          {state.split ? (
            <div className="victory split-victory">
              <span className="split-photos">
                {state.split.map((w) => (
                  <Avatar key={w.playerId} player={store.player(w.playerId)} className="avatar-xl" />
                ))}
                <span className="trophy">✂️</span>
              </span>
              <strong>{state.split.map((w) => store.playerName(w.playerId)).join(' e ')}</strong>
              <span className="muted">racharam o prêmio depois de {state.roundsPlayed} rodada(s)</span>
            </div>
          ) : (
            state.winnerId && (
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
            )
          )}
          <SettlementView match={match} />
          {withPot ? (
            <PayoutPanel match={match} />
          ) : (
            match.stakeCents !== undefined && <p className="muted">Partida de antes do caixa: ninguém casou pelo app, então o prêmio foi acertado fora dele.</p>
          )}
        </Modal>
      )}

      {splitting && (
        <SplitModal
          matchId={match.id}
          onClose={() => setSplitting(false)}
          onDone={() => {
            setSplitting(false);
            setFled(null);
          }}
        />
      )}

      {showDay && <EventCashModal eventId={match.eventId} onClose={() => setShowDay(false)} />}

      {paying && <PayPlayerModal onClose={() => setPaying(false)} />}

      {showLog && <MatchLog match={match} onClose={() => setShowLog(false)} />}

      {staking && <StakeModal matchId={match.id} playerId={staking} onClose={() => setStaking(null)} />}

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
  // Quem já livrou nesta rodada fica de fora da escolha: os novos se somam a esse pacto.
  const current = roundPact(match)?.playerIds ?? [];
  const needed = current.length > 0 ? 1 : 2;
  const error = selected.length >= needed ? validatePact(match, state, selected) : null;
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
            disabled={selected.length < needed || !!error}
            onClick={() => {
              store.addPact(matchId, selected);
              onClose();
            }}
          >
            🤝 {current.length > 0 ? 'Entrar no pacto' : 'Livrar'} ({selected.length})
          </button>
        </>
      }
    >
      <p>
        {current.length > 0 ? (
          <>
            Nesta rodada já estão livrando <strong>{current.map((id) => store.playerName(id)).join(', ')}</strong>. Toque em quem vai entrar no
            pacto.
          </>
        ) : (
          'Toque em quem está livrando.'
        )}{' '}
        Se um deles vencer a partida, devolve {stake !== undefined ? formatMoney(stake) : 'o valor casado'} para cada um dos outros.
      </p>
      <div className="chips">
        {state.standings
          .filter((s) => s.points > 0)
          .map((s) => {
            const inRoundPact = current.includes(s.playerId);
            return (
              <button
                key={s.playerId}
                className={['chip', selected.includes(s.playerId) && 'on', inRoundPact && 'in-pact'].filter(Boolean).join(' ')}
                disabled={inRoundPact}
                onClick={() => toggle(s.playerId)}
              >
                <Avatar player={store.player(s.playerId)} size={34} />
                {store.playerName(s.playerId)}
                <small className="chip-sub">{inRoundPact ? '🤝 já livrando' : `${s.points} pt`}</small>
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

/** Rachar o prêmio entre os dois que sobraram: metade para cada um, ajustável de R$ 5 em R$ 5. */
function SplitModal({ matchId, onClose, onDone }: { matchId: string; onClose: () => void; onDone: () => void }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === matchId)!;
  const state = computeState(match);
  const [a, b] = state.activeIds;
  const prize = prizeFor(match, [a, b]);
  const total = prize?.prizeCents ?? 0;
  const [first, setFirst] = useState(Math.round(total / 2));
  const [text, setText] = useState('');
  const STEP = 500;
  const shares = [
    { playerId: a, cents: first },
    { playerId: b, cents: total - first },
  ];
  const error = validateSplit(match, state, shares);
  const move = (delta: number) => {
    setFirst((v) => Math.min(total, Math.max(0, v + delta)));
    setText('');
  };

  return (
    <Modal
      title="✂️ Rachar o prêmio"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!!error}
            onClick={() => {
              store.splitPrize(matchId, shares);
              onDone();
            }}
          >
            Rachar e encerrar a partida
          </button>
        </>
      }
    >
      <p>
        {store.playerName(a)} e {store.playerName(b)} param de jogar e dividem o prêmio. A partida termina aqui.
      </p>
      {prize && (
        <p className="split-prize">
          Prêmio a rachar: <strong>{formatMoney(total)}</strong>
          {prize.returnsTo.length > 0 && (
            <>
              {' '}
              (pote de {formatMoney(prize.potCents)} menos {formatMoney(prize.potCents - total)} devolvidos pelo livrar a{' '}
              {prize.returnsTo.map((id) => store.playerName(id)).join(', ')})
            </>
          )}
        </p>
      )}
      <div className="split-shares">
        {shares.map((sh, i) => (
          <div key={sh.playerId} className="split-share">
            <Avatar player={store.player(sh.playerId)} size={56} />
            <span>{store.playerName(sh.playerId)}</span>
            <strong>{formatMoney(sh.cents)}</strong>
            <div className="split-adjust">
              <button className="btn" disabled={sh.cents < STEP} onClick={() => move(i === 0 ? -STEP : STEP)}>
                − R$ 5
              </button>
              <button className="btn" disabled={total - sh.cents < STEP} onClick={() => move(i === 0 ? STEP : -STEP)}>
                + R$ 5
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className="payout-cash">
        <span>Ou digite quanto {store.playerName(a)} leva</span>
        <input
          inputMode="decimal"
          placeholder={formatMoney(first)}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const cents = parseMoney(e.target.value);
            if (cents !== undefined && cents <= total) setFirst(cents);
          }}
        />
      </label>
      <button className="link" onClick={() => move(Math.round(total / 2) - first)}>
        Voltar para metade
      </button>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

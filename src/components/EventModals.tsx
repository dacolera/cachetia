import { useState } from 'react';
import { closePlan, defaultEventName, eventCash, eventMatches, type CashMove } from '../domain/events';
import { balances, openPots } from '../domain/ledger';
import { formatMoney, pot } from '../domain/money';
import { computeState } from '../domain/rules';
import type { GameEvent } from '../domain/types';
import { formatDate, useStore } from '../store';
import { Avatar } from './Avatar';
import { Modal } from './ui';

const time = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Caixa de um evento: abertura (zero), cada entrada e saída de dinheiro vivo e quanto deve ter. */
export function EventCashModal({ eventId, onClose }: { eventId?: string; onClose: () => void }) {
  const store = useStore();
  const event = store.events.find((e) => e.id === eventId) ?? store.currentEvent;
  if (!event) {
    return (
      <Modal title="Caixa do evento" onClose={onClose} actions={<button className="btn primary" onClick={onClose}>Fechar</button>}>
        <p>Nenhum evento aberto.</p>
      </Modal>
    );
  }
  const cash = eventCash(store.ledger, store.matches, store.events, event);
  const isOpen = !event.endedAt;
  const credits = [...balances(store.ledger).values()].reduce((a, b) => a + b, 0);
  const pots = openPots(store.ledger, store.matches);

  return (
    <Modal
      title={`🗓️ ${event.name}`}
      onClose={onClose}
      actions={
        <button className="btn primary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <p>
        {isOpen ? 'Aberto' : 'Encerrado'} · de {formatDate(event.startedAt)}
        {event.endedAt && <> a {formatDate(event.endedAt)}</>} · {cash.matches.length} partida(s)
      </p>

      <div className="day-summary">
        <div>
          <span>Abriu com</span>
          <strong>{formatMoney(cash.opening)}</strong>
        </div>
        <div className="in">
          <span>Entrou</span>
          <strong>+ {formatMoney(cash.cashIn)}</strong>
        </div>
        <div className="out">
          <span>Saiu</span>
          <strong>− {formatMoney(cash.cashOut)}</strong>
        </div>
        <div className="total">
          <span>💵 {isOpen ? 'Deve ter em dinheiro' : 'Fechou com'}</span>
          <strong>{formatMoney(cash.closing)}</strong>
        </div>
      </div>
      {isOpen && (
        <p className="day-split">
          {formatMoney(credits)} de crédito dos jogadores (total no caixa) + {formatMoney(pots)} em potes ainda não pagos
        </p>
      )}

      <section>
        <h3>Partidas do evento</h3>
        {cash.matches.length === 0 ? (
          <p className="muted">Nenhuma partida ainda.</p>
        ) : (
          <ol className="day-matches">
            {cash.matches.map((m, i) => {
              const st = computeState(m);
              const p = pot(m);
              return (
                <li key={m.id}>
                  <strong>Partida {i + 1}</strong> · {time(m.createdAt)}
                  {p !== undefined && <> · pote {formatMoney(p)}</>}
                  {' · '}
                  {st.split ? (
                    <>
                      ✂️ {st.split.map((w) => store.playerName(w.playerId)).join(' e ')} racharam
                      {m.paidOutAt ? ', prêmio pago' : ', prêmio a pagar'}
                    </>
                  ) : st.winnerId ? (
                    <>
                      🏆 {store.playerName(st.winnerId)}
                      {m.stakeCents === undefined ? '' : m.paidOutAt ? ', prêmio pago' : ', prêmio a pagar'}
                    </>
                  ) : (
                    <em>em andamento</em>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section>
        <h3>Dinheiro vivo, do mais recente para o mais antigo</h3>
        {cash.moves.length === 0 ? (
          <p className="muted">Nenhuma entrada ou saída de dinheiro.</p>
        ) : (
          <ol className="day-moves">
            {[...cash.moves].reverse().map((m) => (
              <MoveRow key={m.entry.id} move={m} />
            ))}
          </ol>
        )}
      </section>
    </Modal>
  );
}

function MoveRow({ move }: { move: CashMove }) {
  const store = useStore();
  const name = store.playerName(move.entry.playerId);
  const text =
    move.entry.kind === 'prizeCash'
      ? `Prêmio pago a ${name} em dinheiro`
      : move.atClose
        ? `${name} recebeu o crédito no encerramento`
        : move.entry.kind === 'withdraw'
          ? `${name} sacou do crédito`
          : move.atStake
            ? `${name} entregou ao casar`
            : `${name} deixou no caixa`;
  return (
    <li className="day-move">
      <time>{time(move.entry.at)}</time>
      <span className="day-move-text">
        {text}
        <small>{move.atClose ? 'Encerramento' : move.matchNumber ? `Partida ${move.matchNumber}` : 'Fora de partida'}</small>
      </span>
      <span className={move.delta > 0 ? 'day-move-delta in' : 'day-move-delta out'}>
        {move.delta > 0 ? '+' : '−'} {formatMoney(Math.abs(move.delta))}
      </span>
      <span className="day-move-after">{formatMoney(move.cashAfter)}</span>
    </li>
  );
}

/** Abrir um evento novo: o caixa nasce zerado. */
export function StartEventModal({ onClose, onStarted }: { onClose: () => void; onStarted?: (ev: GameEvent) => void }) {
  const store = useStore();
  const [name, setName] = useState(defaultEventName(store.events));
  return (
    <Modal
      title="Abrir evento"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!name.trim()}
            onClick={() => {
              const ev = store.startEvent(name);
              onClose();
              onStarted?.(ev);
            }}
          >
            Abrir evento
          </button>
        </>
      }
    >
      <p>O caixa do evento começa zerado. Partidas e movimentos de caixa a partir de agora ficam nele, até você encerrar.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome do evento" />
    </Modal>
  );
}

/** Encerrar o evento: paga em dinheiro o crédito de cada um e o caixa fica zerado. */
export function EndEventModal({ onClose, onOpenMatch }: { onClose: () => void; onOpenMatch: (matchId: string) => void }) {
  const store = useStore();
  const event = store.currentEvent;
  if (!event) return null;
  const plan = closePlan(store.ledger, store.matches, store.events, event);
  const blocked = plan.blockers.length > 0;
  return (
    <Modal
      title={`Encerrar ${event.name}?`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn danger"
            disabled={blocked}
            onClick={() => {
              store.endEvent();
              onClose();
            }}
          >
            {plan.totalCents > 0 ? `Pagar ${formatMoney(plan.totalCents)} e encerrar` : 'Encerrar evento'}
          </button>
        </>
      }
    >
      {blocked ? (
        <>
          <p className="error">Antes de encerrar, resolva estas partidas:</p>
          <ul className="close-blockers">
            {plan.blockers.map((b) => (
              <li key={b.matchId}>
                <span>
                  <strong>Partida {b.number}</strong>
                  {b.reason === 'ongoing' ? ' ainda está em andamento: termine ou descarte.' : ' terminou, mas o prêmio não foi pago.'}
                </span>
                <button
                  className="btn"
                  onClick={() => {
                    onClose();
                    onOpenMatch(b.matchId);
                  }}
                >
                  {b.reason === 'ongoing' ? 'Abrir' : 'Pagar'}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : plan.payouts.length === 0 ? (
        <p>Ninguém tem crédito: o caixa já está zerado.</p>
      ) : (
        <>
          <p>Entregue em dinheiro o crédito que sobrou para cada um. Depois disso o caixa do evento fica zerado.</p>
          <ul className="close-payouts">
            {plan.payouts.map((p) => (
              <li key={p.playerId}>
                <Avatar player={store.player(p.playerId)} size={32} />
                <span>{store.playerName(p.playerId)}</span>
                <strong>{formatMoney(p.cents)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted">
        {eventMatches(store.matches, store.events, event.id).length} partida(s) desde {formatDate(event.startedAt)}. O evento fica salvo e dá para consultar o caixa
        dele depois.
      </p>
    </Modal>
  );
}

/** Todos os eventos, do mais recente para o mais antigo; tocar abre o caixa de cada um. */
export function EventsListModal({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const [viewing, setViewing] = useState<string | null>(null);
  if (viewing) return <EventCashModal eventId={viewing} onClose={() => setViewing(null)} />;
  const list = [...store.events].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <Modal
      title="Eventos"
      onClose={onClose}
      actions={
        <button className="btn primary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {list.length === 0 && <p>Nenhum evento ainda.</p>}
      <ul className="events-list">
        {list.map((ev) => {
          const cash = eventCash(store.ledger, store.matches, store.events, ev);
          return (
            <li key={ev.id}>
              <button className="list-item" onClick={() => setViewing(ev.id)}>
                <span className="list-main">
                  {ev.name} {!ev.endedAt && <span className="tag pact-tag">aberto</span>}
                </span>
                <span className="muted">
                  {formatDate(ev.startedAt)}
                  {ev.endedAt && <> a {formatDate(ev.endedAt)}</>} · {cash.matches.length} partida(s) · movimentou {formatMoney(cash.cashIn)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

import { useState, type ReactNode } from 'react';
import { formatMoney } from '../domain/money';
import { timeline, type PointsChange, type TimelineItem } from '../domain/timeline';
import type { Match } from '../domain/types';
import { useStore } from '../store';
import { RoundsTable } from './RoundsTable';
import { Modal } from './ui';

const time = (iso: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '');

/** Memória da partida em andamento: linha do tempo (mais recente primeiro) e placar por rodada. */
export function MatchLog({ match, onClose }: { match: Match; onClose: () => void }) {
  const store = useStore();
  const [tab, setTab] = useState<'timeline' | 'table'>('timeline');
  const items = timeline(match, store.ledger);
  const rounds = [...new Set(items.map((i) => i.round))].sort((a, b) => b - a);

  return (
    <Modal
      title="📜 Memória da partida"
      onClose={onClose}
      actions={
        <button className="btn primary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className="log-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'timeline'} className={tab === 'timeline' ? 'chip on' : 'chip'} onClick={() => setTab('timeline')}>
          Linha do tempo
        </button>
        <button role="tab" aria-selected={tab === 'table'} className={tab === 'table' ? 'chip on' : 'chip'} onClick={() => setTab('table')}>
          Placar por rodada
        </button>
      </div>

      {tab === 'table' ? (
        <RoundsTable match={match} />
      ) : (
        <div className="log">
          {rounds.map((r) => (
            <section key={r} className="log-group">
              <h3>Rodada {r}</h3>
              <ol>
                {items
                  .filter((i) => i.round === r)
                  .reverse()
                  .map((item, k) => (
                    <LogRow key={k} item={item} />
                  ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

function LogRow({ item }: { item: TimelineItem }) {
  const store = useStore();
  const name = (id: string) => store.playerName(id);
  const names = (ids: string[]) => ids.map(name).join(', ');
  const change = (c: PointsChange, label: string) => (
    <li key={c.playerId}>
      {name(c.playerId)} {label}: {c.from} → <strong className={c.to === 0 ? 'log-zero' : undefined}>{c.to}</strong>
    </li>
  );

  let icon = '';
  let text: ReactNode;
  let details: ReactNode = null;
  /** Movimento de dinheiro vivo: quanto entrou ou saiu da caixa e quanto deve ter ficado. */
  let cash: { delta: number; after: number } | null = null;
  switch (item.kind) {
    case 'begin':
      icon = '🎲';
      text = (
        <>
          Partida começou com {names(item.playerIds)}
          {item.stakeCents !== undefined && <> · cada um casa {formatMoney(item.stakeCents)}</>}
        </>
      );
      break;
    case 'join':
      icon = '➕';
      text = `${name(item.playerId)} entrou com ${item.points} ponto(s)`;
      break;
    case 'stake':
      icon = '💵';
      text = `${name(item.playerId)} casou ${formatMoney(item.cents)}`;
      details = (
        <>
          {item.handedCents > 0 && <li>Entregou {formatMoney(item.handedCents)} em dinheiro</li>}
          {item.creditUsedCents > 0 && <li>Usou {formatMoney(item.creditUsedCents)} do crédito</li>}
          {item.changeCents > 0 && <li>Troco de {formatMoney(item.changeCents)} ficou de crédito</li>}
        </>
      );
      cash = item.handedCents > 0 ? { delta: item.handedCents, after: item.cashAfter } : null;
      break;
    case 'deposit':
      icon = '📥';
      text = `${name(item.playerId)} deixou ${formatMoney(item.cents)} no caixa (crédito)`;
      cash = { delta: item.cents, after: item.cashAfter };
      break;
    case 'withdraw':
      icon = '📤';
      text = `${name(item.playerId)} sacou ${formatMoney(item.cents)} do crédito`;
      cash = { delta: -item.cents, after: item.cashAfter };
      break;
    case 'pact':
      icon = '🤝';
      text = item.joined ? `${names(item.playerIds)} ${item.playerIds.length > 1 ? 'entraram' : 'entrou'} no pacto` : `${names(item.playerIds)} livraram`;
      break;
    case 'start':
      icon = '▶';
      text = (
        <>
          Rodada executada
          {item.dealerId && (
            <>
              {' '}
              · ♠ {name(item.dealerId)} deu
              {item.playHandId && item.playHandId !== item.handId ? (
                <>
                  , {name(item.handId!)} correu e {name(item.playHandId)} foi mão
                </>
              ) : (
                item.handId && <>, {name(item.handId)} foi mão</>
              )}
            </>
          )}
        </>
      );
      details = (
        <>
          {item.fled.map((c) => change(c, 'correu'))}
          <li>Jogando: {names(item.playing)}</li>
        </>
      );
      break;
    case 'round':
      icon = '🏆';
      text = `${name(item.winnerId)} ganhou`;
      details = (
        <>
          {item.fled.map((c) => change(c, 'correu'))}
          {item.lost.map((c) => change(c, 'perdeu'))}
          {item.eliminated.map((id) => (
            <li key={`out-${id}`} className="log-out">
              {name(id)} saiu da partida
            </li>
          ))}
        </>
      );
      break;
    case 'split':
      icon = '✂️';
      text = `${names(item.shares.map((w) => w.playerId))} racharam o prêmio`;
      details = item.shares.map((w) => (
        <li key={w.playerId}>
          {name(w.playerId)} leva {formatMoney(w.cents)}
        </li>
      ));
      break;
    case 'payout': {
      const cashOut = item.winners.reduce((sum, w) => sum + w.cashCents, 0);
      icon = '💰';
      text = `Prêmio pago a ${names(item.winners.map((w) => w.playerId))}`;
      details = (
        <>
          {item.winners.map((w) => (
            <li key={w.playerId}>
              {name(w.playerId)}: {formatMoney(w.cashCents)} em dinheiro
              {w.creditCents > 0 && <>, {formatMoney(w.creditCents)} ficou de crédito</>}
            </li>
          ))}
          {item.refunds.map((r) => (
            <li key={r.playerId}>
              {name(r.playerId)} recebeu {formatMoney(r.cents)} de volta pelo livrar (crédito)
            </li>
          ))}
        </>
      );
      cash = cashOut > 0 ? { delta: -cashOut, after: item.cashAfter } : null;
      break;
    }
  }

  return (
    <li className={`log-item log-${item.kind}`}>
      <span className="log-icon" aria-hidden>
        {icon}
      </span>
      <div className="log-body">
        <span className="log-text">{text}</span>
        {details && <ul className="log-details">{details}</ul>}
        {cash && (
          <span className={cash.delta > 0 ? 'log-cash in' : 'log-cash out'}>
            {cash.delta > 0 ? '+' : '−'} {formatMoney(Math.abs(cash.delta))} na caixa · ficou {formatMoney(cash.after)}
          </span>
        )}
      </div>
      <time className="log-time">{time(item.at)}</time>
    </li>
  );
}

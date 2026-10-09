import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { DepositModal, WithdrawModal } from '../components/CashModals';
import { Modal, TopBar } from '../components/ui';
import { balanceOf, balances, cashInBox, openPots, type LedgerEntry, type LedgerKind } from '../domain/ledger';
import { formatMoney } from '../domain/money';
import type { Navigate } from '../nav';
import { formatDate, useStore } from '../store';

const KIND_LABEL: Record<LedgerKind, string> = {
  deposit: 'Entregou dinheiro',
  withdraw: 'Sacou',
  stake: 'Casou',
  credit: 'Crédito da partida',
  prizeCash: 'Prêmio em dinheiro',
};

const BALANCE_SIGN: Record<LedgerKind, number> = { deposit: 1, credit: 1, withdraw: -1, stake: -1, prizeCash: 0 };

type Dialog = { kind: 'deposit' | 'withdraw' | 'statement'; playerId: string } | null;

export function Cash({ go }: { go: Navigate }) {
  const store = useStore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const bal = balances(store.ledger);
  const cash = cashInBox(store.ledger);
  const credits = [...bal.values()].reduce((a, b) => a + b, 0);
  const pots = openPots(store.ledger, store.matches);

  const rows = store.players
    .filter((p) => !p.archived || (bal.get(p.id) ?? 0) !== 0)
    .sort((a, b) => (bal.get(b.id) ?? 0) - (bal.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));

  return (
    <main className="screen">
      <TopBar title="Caixa" onBack={() => go({ name: 'home' })} />

      <section className="panel cash-total">
        <span className="muted">Dinheiro que deve estar na caixa</span>
        <strong>{formatMoney(cash)}</strong>
        <span className="muted">
          {formatMoney(credits)} de crédito dos jogadores + {formatMoney(pots)} em potes de partidas em andamento
        </span>
      </section>

      <ul className="list cash-list">
        {rows.map((p) => {
          const b = bal.get(p.id) ?? 0;
          return (
            <li key={p.id} className="cash-row">
              <button className="cash-row-who" onClick={() => setDialog({ kind: 'statement', playerId: p.id })}>
                <Avatar player={p} size={48} />
                <span>
                  <strong>{p.name}</strong>
                  <span className={b > 0 ? 'money-pos' : 'muted'}>{b > 0 ? `${formatMoney(b)} de crédito` : 'sem crédito'}</span>
                </span>
              </button>
              <div className="cash-row-actions">
                <button className="btn" onClick={() => setDialog({ kind: 'deposit', playerId: p.id })}>
                  Entregar
                </button>
                <button className="btn" disabled={b <= 0} onClick={() => setDialog({ kind: 'withdraw', playerId: p.id })}>
                  Sacar
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {dialog?.kind === 'deposit' && <DepositModal playerId={dialog.playerId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'withdraw' && <WithdrawModal playerId={dialog.playerId} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'statement' && <Statement playerId={dialog.playerId} onClose={() => setDialog(null)} />}
    </main>
  );
}

/** Extrato do jogador, com a opção de desfazer lançamentos manuais feitos por engano. */
function Statement({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const entries = store.ledger.filter((e) => e.playerId === playerId).sort((a, b) => b.at.localeCompare(a.at));
  const balance = balanceOf(store.ledger, playerId);

  function canUndo(e: LedgerEntry): boolean {
    if (e.kind === 'withdraw') return true;
    if (e.kind === 'deposit') return balance - e.amountCents >= 0;
    if (e.kind === 'stake') {
      const m = store.matches.find((x) => x.id === e.matchId);
      return !!m && !m.finishedAt && !m.events.some((ev) => ev.type === 'round');
    }
    return false;
  }

  return (
    <Modal
      title={`Extrato: ${store.playerName(playerId)}`}
      onClose={onClose}
      actions={
        <button className="btn primary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <p>
        Crédito atual: <strong>{formatMoney(balance)}</strong>
      </p>
      {entries.length === 0 && <p className="muted">Nenhum movimento ainda.</p>}
      <ul className="statement">
        {entries.map((e) => {
          const sign = BALANCE_SIGN[e.kind];
          return (
            <li key={e.id}>
              <span>
                <strong>{KIND_LABEL[e.kind]}</strong>
                <small className="muted">{formatDate(e.at)}</small>
              </span>
              <span className={sign > 0 ? 'money-pos' : sign < 0 ? 'money-neg' : 'money-zero'}>
                {sign > 0 ? '+' : sign < 0 ? '-' : ''}
                {formatMoney(e.amountCents)}
              </span>
              {canUndo(e) && (
                <button
                  className="btn ghost danger-text statement-undo"
                  onClick={() => {
                    try {
                      store.removeLedgerEntry(e.id);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Não foi possível desfazer.');
                    }
                  }}
                >
                  Desfazer
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

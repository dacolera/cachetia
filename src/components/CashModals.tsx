import { useState } from 'react';
import { balanceOf } from '../domain/ledger';
import { formatMoney, parseMoney } from '../domain/money';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Modal } from './ui';

/** Notas mais comuns na mesa. */
const NOTES = [1000, 2000, 5000, 10000];

/** Escolha de um valor: notas comuns ou outro valor digitado. */
export function MoneyPicker({ value, onChange, options = NOTES }: { value?: number; onChange: (cents?: number) => void; options?: number[] }) {
  const [custom, setCustom] = useState('');
  return (
    <div className="chips">
      {options.map((v) => (
        <button
          key={v}
          className={value === v && !custom ? 'chip on' : 'chip'}
          onClick={() => {
            setCustom('');
            onChange(value === v ? undefined : v);
          }}
        >
          {formatMoney(v)}
        </button>
      ))}
      <input
        className="stake-input"
        inputMode="decimal"
        placeholder="Outro valor"
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          onChange(parseMoney(e.target.value));
        }}
      />
    </div>
  );
}

function Who({ playerId }: { playerId: string }) {
  const store = useStore();
  const balance = balanceOf(store.ledger, playerId);
  return (
    <div className="cash-who">
      <Avatar player={store.player(playerId)} size={56} />
      <div>
        <strong>{store.playerName(playerId)}</strong>
        <span className="muted">Crédito: {formatMoney(balance)}</span>
      </div>
    </div>
  );
}

export function StakeModal({ matchId, playerId, onClose }: { matchId: string; playerId: string; onClose: () => void }) {
  const store = useStore();
  const match = store.matches.find((m) => m.id === matchId)!;
  const stake = match.stakeCents!;
  const balance = balanceOf(store.ledger, playerId);
  const [handed, setHanded] = useState<number | undefined>();
  const enoughCredit = balance >= stake;
  const after = balance + (handed ?? 0) - stake;
  const ok = after >= 0;

  function confirm() {
    store.stake(matchId, playerId, handed ?? 0);
    onClose();
  }

  return (
    <Modal
      title={`Casar ${formatMoney(stake)}`}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!ok} onClick={confirm}>
            {handed ? `Casar entregando ${formatMoney(handed)}` : 'Casar com o crédito'}
          </button>
        </>
      }
    >
      <Who playerId={playerId} />
      <h3>{enoughCredit ? 'Entregou dinheiro? (opcional)' : 'Quanto entregou?'}</h3>
      <MoneyPicker value={handed} onChange={setHanded} />
      <p className={ok ? 'cash-preview' : 'error'}>
        {ok
          ? after > 0
            ? `Casa ${formatMoney(stake)} e fica com ${formatMoney(after)} de crédito.`
            : `Casa ${formatMoney(stake)} e fica sem crédito.`
          : `Faltam ${formatMoney(-after)} para casar.`}
      </p>
    </Modal>
  );
}

export function DepositModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const store = useStore();
  const [amount, setAmount] = useState<number | undefined>();
  const balance = balanceOf(store.ledger, playerId);
  return (
    <Modal
      title="Entregar dinheiro"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!amount}
            onClick={() => {
              store.deposit(playerId, amount!);
              onClose();
            }}
          >
            Entregar {amount ? formatMoney(amount) : ''}
          </button>
        </>
      }
    >
      <Who playerId={playerId} />
      <MoneyPicker value={amount} onChange={setAmount} />
      {amount && <p className="cash-preview">Fica com {formatMoney(balance + amount)} de crédito.</p>}
    </Modal>
  );
}

export function WithdrawModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const store = useStore();
  const balance = balanceOf(store.ledger, playerId);
  const [amount, setAmount] = useState<number | undefined>(balance);
  const ok = !!amount && amount <= balance;
  return (
    <Modal
      title="Sacar crédito"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!ok}
            onClick={() => {
              store.withdraw(playerId, amount!);
              onClose();
            }}
          >
            Sacar {amount ? formatMoney(amount) : ''}
          </button>
        </>
      }
    >
      <Who playerId={playerId} />
      <MoneyPicker value={amount} onChange={setAmount} options={[balance, ...NOTES.filter((n) => n < balance)]} />
      {amount !== undefined && amount > balance && <p className="error">O saque é maior que o crédito.</p>}
      {ok && <p className="cash-preview">Entregue {formatMoney(amount!)} em dinheiro. Sobra {formatMoney(balance - amount!)} de crédito.</p>}
    </Modal>
  );
}

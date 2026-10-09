import { useState } from 'react';
import { payoutPlan } from '../domain/ledger';
import { formatMoney, parseMoney } from '../domain/money';
import type { Match } from '../domain/types';
import { useStore } from '../store';

/** Pagamento do prêmio pelo caixa. Sem troco, parte do prêmio pode ficar de crédito. */
export function PayoutPanel({ match }: { match: Match }) {
  const store = useStore();
  const plan = payoutPlan(match);
  const [cashText, setCashText] = useState('');
  if (!plan) return null;

  const winner = store.playerName(plan.winnerId);
  const refunds = plan.refunds.map((r) => `${store.playerName(r.playerId)} recebe ${formatMoney(r.cents)} de crédito`);

  if (match.paidOutAt) {
    const entries = store.ledger.filter((e) => e.matchId === match.id && e.playerId === plan.winnerId);
    const cash = entries.find((e) => e.kind === 'prizeCash')?.amountCents ?? 0;
    const credit = entries.find((e) => e.kind === 'credit')?.amountCents ?? 0;
    return (
      <div className="payout paid">
        <p>
          ✓ Prêmio pago: {winner} levou <strong>{formatMoney(cash)}</strong> em dinheiro
          {credit > 0 && (
            <>
              {' '}
              e ficou com <strong>{formatMoney(credit)}</strong> de crédito
            </>
          )}
          .
        </p>
        {refunds.length > 0 && <p className="muted">{refunds.join('; ')}.</p>}
      </div>
    );
  }

  const typed = cashText.trim() ? parseMoney(cashText) ?? 0 : plan.winnerCents;
  const cash = Math.min(typed, plan.winnerCents);
  const credit = plan.winnerCents - cash;

  return (
    <div className="payout">
      <h3>💵 Pagar o prêmio</h3>
      <p>
        {winner} recebe <strong>{formatMoney(plan.winnerCents)}</strong>
        {plan.refunds.length > 0 && ' (o pote menos as devoluções do livrar)'}.
      </p>
      <label className="payout-cash">
        <span>Leva em dinheiro</span>
        <input inputMode="decimal" placeholder={formatMoney(plan.winnerCents)} value={cashText} onChange={(e) => setCashText(e.target.value)} />
      </label>
      {credit > 0 && <p className="muted">Sem troco? Os {formatMoney(credit)} restantes ficam de crédito para {winner}.</p>}
      {typed > plan.winnerCents && <p className="error">Não pode passar de {formatMoney(plan.winnerCents)}.</p>}
      {refunds.length > 0 && <p className="muted">{refunds.join('; ')}.</p>}
      <button className="btn primary" disabled={typed > plan.winnerCents} onClick={() => store.payOut(match.id, cash)}>
        Pagar {formatMoney(cash)} em dinheiro{credit > 0 ? ` + ${formatMoney(credit)} de crédito` : ''}
      </button>
    </div>
  );
}

import { useState } from 'react';
import { payoutPlan } from '../domain/ledger';
import { formatMoney, parseMoney } from '../domain/money';
import type { Match } from '../domain/types';
import { useStore } from '../store';

/** Pagamento do prêmio pelo caixa: um vencedor, ou os dois que racharam. Sem troco, parte pode ficar de crédito. */
export function PayoutPanel({ match }: { match: Match }) {
  const store = useStore();
  const plan = payoutPlan(match);
  const [cashText, setCashText] = useState<Record<string, string>>({});
  if (!plan) return null;

  const refunds = plan.refunds.map((r) => `${store.playerName(r.playerId)} recebe ${formatMoney(r.cents)} de crédito`);

  if (match.paidOutAt) {
    return (
      <div className="payout paid">
        {plan.winners.map((w) => {
          const entries = store.ledger.filter((e) => e.matchId === match.id && e.playerId === w.playerId);
          const cash = entries.filter((e) => e.kind === 'prizeCash').reduce((s, e) => s + e.amountCents, 0);
          const credit = entries.filter((e) => e.kind === 'credit').reduce((s, e) => s + e.amountCents, 0);
          return (
            <p key={w.playerId}>
              ✓ Prêmio pago: {store.playerName(w.playerId)} levou <strong>{formatMoney(cash)}</strong> em dinheiro
              {credit > 0 && (
                <>
                  {' '}
                  e ficou com <strong>{formatMoney(credit)}</strong> de crédito
                </>
              )}
              .
            </p>
          );
        })}
        {refunds.length > 0 && <p className="muted">{refunds.join('; ')}.</p>}
      </div>
    );
  }

  const rows = plan.winners.map((w) => {
    const text = cashText[w.playerId]?.trim();
    const typed = text ? (parseMoney(text) ?? 0) : w.cents;
    const cash = Math.min(typed, w.cents);
    return { ...w, typed, cash, credit: w.cents - cash, over: typed > w.cents };
  });
  const totalCash = rows.reduce((s, r) => s + r.cash, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const split = plan.winners.length > 1;

  return (
    <div className="payout">
      <h3>💵 Pagar o prêmio</h3>
      {rows.map((r) => {
        const name = store.playerName(r.playerId);
        return (
          <div key={r.playerId} className="payout-row">
            <p>
              {name} recebe <strong>{formatMoney(r.cents)}</strong>
              {!split && plan.refunds.length > 0 && ' (o pote menos as devoluções do livrar)'}
              {split && ' do racha'}.
            </p>
            <label className="payout-cash">
              <span>Leva em dinheiro</span>
              <input
                inputMode="decimal"
                placeholder={formatMoney(r.cents)}
                value={cashText[r.playerId] ?? ''}
                onChange={(e) => setCashText((cur) => ({ ...cur, [r.playerId]: e.target.value }))}
              />
            </label>
            {r.credit > 0 && <p className="muted">Sem troco? Os {formatMoney(r.credit)} restantes ficam de crédito para {name}.</p>}
            {r.over && <p className="error">Não pode passar de {formatMoney(r.cents)}.</p>}
          </div>
        );
      })}
      {refunds.length > 0 && <p className="muted">{refunds.join('; ')}.</p>}
      <button
        className="btn primary"
        disabled={rows.some((r) => r.over)}
        onClick={() => store.payOut(match.id, Object.fromEntries(rows.map((r) => [r.playerId, r.cash])))}
      >
        Pagar {formatMoney(totalCash)} em dinheiro{totalCredit > 0 ? ` + ${formatMoney(totalCredit)} de crédito` : ''}
      </button>
    </div>
  );
}

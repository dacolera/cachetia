import type { ReactNode } from 'react';

/** Placar do jogador na partida: vitórias, corridas e derrotas. */
export function Tally({ wins, fled, lost }: { wins: number; fled: number; lost: number }) {
  return (
    <div className="tally" aria-label={`${wins} vitória(s), ${fled} corrida(s), ${lost} derrota(s)`}>
      <span title="Vitórias">🏆<small>{wins}</small></span>
      <span title="Corridas">🏃<small>{fled}</small></span>
      <span title="Derrotas">💀<small>{lost}</small></span>
    </div>
  );
}

export function Modal({ title, children, actions, onClose }: { title: string; children?: ReactNode; actions: ReactNode; onClose?: () => void }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

export function TopBar({ title, onBack, children }: { title: ReactNode; onBack?: () => void; children?: ReactNode }) {
  return (
    <header className="topbar">
      {onBack ? (
        <button className="btn ghost" onClick={onBack}>
          ‹ Voltar
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <div className="topbar-actions">{children}</div>
    </header>
  );
}

/** Mão: o primeiro a receber cartas, logo à direita de quem dá. */
export function HandBadge() {
  return (
    <span className="hand-badge" title="Mão: primeiro a receber as cartas">
      mão
    </span>
  );
}

export function DealerBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="dealer-badge" title="Dá as cartas">
      {compact ? '♠' : '♠ dá as cartas'}
    </span>
  );
}

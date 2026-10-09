import type { ReactNode } from 'react';
import { START_POINTS } from '../domain/rules';

export function Pips({ points }: { points: number }) {
  return (
    <div className="pips" aria-hidden>
      {Array.from({ length: Math.max(START_POINTS, points) }, (_, i) => (
        <span key={i} className={i < points ? 'pip on' : 'pip'} />
      ))}
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

export function DealerBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="dealer-badge" title="Dá as cartas">
      {compact ? '♠' : '♠ dá as cartas'}
    </span>
  );
}

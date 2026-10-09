import type { CSSProperties } from 'react';
import type { Player } from '../domain/types';

const COLORS = ['#b3261e', '#1f6f8b', '#7b4fa0', '#c27a12', '#2e7d4f', '#8a3b5c', '#4a5fa8', '#6b6b2a'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Foto do jogador ou, sem foto, as iniciais num círculo colorido. */
export function Avatar({ player, size, className = '' }: { player?: Player; size?: number | string; className?: string }) {
  const name = player?.name ?? '?';
  const style: CSSProperties = size !== undefined ? { width: size, height: size } : {};
  if (player?.photo) return <img className={`avatar ${className}`} style={style} src={player.photo} alt={name} />;
  return (
    <span className={`avatar ${className}`} style={{ ...style, background: colorFor(name) }} aria-label={name}>
      {initials(name)}
    </span>
  );
}

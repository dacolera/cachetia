import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PlayerForm } from '../components/PlayerForm';
import { TopBar } from '../components/ui';
import type { Player } from '../domain/types';
import type { Navigate } from '../nav';
import { useStore } from '../store';

export function Players({ go }: { go: Navigate }) {
  const store = useStore();
  const [editing, setEditing] = useState<Player | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const sorted = [...store.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const active = sorted.filter((p) => !p.archived);
  const archived = sorted.filter((p) => p.archived);

  return (
    <main className="screen">
      <TopBar title="Jogadores" onBack={() => go({ name: 'home' })}>
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Novo jogador
        </button>
      </TopBar>

      {active.length === 0 && <p className="empty">Cadastre a família aqui, com foto, para montar as partidas mais rápido.</p>}

      <div className="player-grid">
        {active.map((p) => (
          <button key={p.id} className="player-tile" onClick={() => setEditing(p)}>
            <Avatar player={p} className="avatar-lg" />
            <span className="player-tile-name">{p.name}</span>
            {!p.photo && <span className="muted">sem foto</span>}
          </button>
        ))}
      </div>

      {archived.length > 0 && (
        <section className="archived">
          <button className="btn ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? '▾' : '▸'} Arquivados ({archived.length})
          </button>
          {showArchived && (
            <>
              <p className="muted">Não aparecem na hora de montar a partida, mas continuam no histórico e no ranking.</p>
              <div className="player-grid">
                {archived.map((p) => (
                  <div key={p.id} className="player-tile archived-tile">
                    <Avatar player={p} className="avatar-lg" />
                    <span className="player-tile-name">{p.name}</span>
                    <button className="btn" onClick={() => store.updatePlayer(p.id, { archived: false })}>
                      Restaurar
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {editing && <PlayerForm player={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

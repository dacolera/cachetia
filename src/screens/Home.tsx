import { useRef, useState } from 'react';
import { Modal } from '../components/ui';
import { computeState } from '../domain/rules';
import type { Navigate } from '../nav';
import { formatDate, useStore } from '../store';
import type { Backup } from '../storage/repository';

export function Home({ go }: { go: Navigate }) {
  const store = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const ongoing = [...store.matches].reverse().find((m) => !m.finishedAt);
  const ongoingState = ongoing && computeState(ongoing);

  async function exportBackup() {
    const data = await store.exportBackup();
    const day = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-');
    const file = new File([JSON.stringify(data)], `cacheta-backup-${day}.json`, { type: 'application/json' });
    // No iPad a folha de compartilhar permite salvar no Arquivos, mandar por WhatsApp ou AirDrop.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Backup da Cacheta' });
      } catch {
        // compartilhamento cancelado
      }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(file: File) {
    try {
      await store.importBackup(JSON.parse(await file.text()) as Backup);
      setMessage('Backup restaurado com sucesso.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  }

  return (
    <main className="home">
      <div className="brand">
        <span className="brand-suits">♠ ♥ ♣ ♦</span>
        <h1>Cacheta da Família</h1>
      </div>

      {ongoing && ongoingState && (
        <button className="ongoing" onClick={() => go({ name: 'match', id: ongoing.id })}>
          <span className="ongoing-label">Partida em andamento</span>
          <span className="ongoing-info">
            {ongoingState.activeIds.length} na mesa · {ongoingState.roundsPlayed} rodada(s) · desde {formatDate(ongoing.createdAt)}
          </span>
          <span className="ongoing-cta">Continuar ›</span>
        </button>
      )}

      <div className="home-actions">
        <button className="btn primary big" onClick={() => (ongoing ? setConfirmNew(true) : go({ name: 'new' }))}>
          Nova partida
        </button>
        <button className="btn big" onClick={() => go({ name: 'players' })}>
          Jogadores
        </button>
        <button className="btn big" onClick={() => go({ name: 'history' })}>
          Histórico
        </button>
        <button className="btn big" onClick={() => go({ name: 'ranking' })}>
          Ranking
        </button>
      </div>

      <footer className="home-footer">
        <button className="btn ghost" onClick={exportBackup}>
          Salvar backup
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Restaurar backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBackup(f);
            e.target.value = '';
          }}
        />
      </footer>

      {confirmNew && ongoing && (
        <Modal
          title="Já tem uma partida em andamento"
          onClose={() => setConfirmNew(false)}
          actions={
            <>
              <button className="btn" onClick={() => go({ name: 'match', id: ongoing.id })}>
                Continuar a atual
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  store.deleteMatch(ongoing.id);
                  go({ name: 'new' });
                }}
              >
                Descartar e começar outra
              </button>
            </>
          }
        >
          <p>Ao descartar, a partida atual some do histórico.</p>
        </Modal>
      )}

      {message && <Modal title={message} onClose={() => setMessage(null)} actions={<button className="btn primary" onClick={() => setMessage(null)}>OK</button>} />}
    </main>
  );
}

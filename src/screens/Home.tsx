import { useRef, useState } from 'react';
import { EndEventModal, EventsListModal, StartEventModal } from '../components/EventModals';
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
  const [eventDialog, setEventDialog] = useState<'start' | 'start-then-new' | 'end' | 'list' | null>(null);
  const current = store.currentEvent;

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

      <section className="event-card">
        {current ? (
          <>
            <span className="event-label">🗓️ Evento aberto</span>
            <strong className="event-name">{current.name}</strong>
            <span className="event-info">desde {formatDate(current.startedAt)}</span>
            <div className="event-actions">
              <button className="btn ghost" onClick={() => setEventDialog('list')}>
                Eventos
              </button>
              <button className="btn ghost danger-text" onClick={() => setEventDialog('end')}>
                Encerrar evento
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="event-label">Nenhum evento aberto</span>
            <span className="event-info">Abra um evento para jogar: o caixa dele começa zerado.</span>
            <div className="event-actions">
              <button className="btn ghost" onClick={() => setEventDialog('list')}>
                Eventos
              </button>
              <button className="btn" onClick={() => setEventDialog('start')}>
                + Abrir evento
              </button>
            </div>
          </>
        )}
      </section>

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
        <button className="btn primary big" onClick={() => (ongoing ? setConfirmNew(true) : current ? go({ name: 'new' }) : setEventDialog('start-then-new'))}>
          Nova partida
        </button>
        <button className="btn big" onClick={() => go({ name: 'cash' })}>
          💵 Caixa
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
      <p className="app-version">versão {__APP_VERSION__}</p>
      <p className="app-version">
        Cédulas via Wikimedia Commons: R$ 10, 20 e 50 por Rawlan1998 (
        <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" target="_blank" rel="noreferrer">
          CC BY-SA 4.0
        </a>
        ); R$ 100 e 200 em domínio público.
      </p>

      {(eventDialog === 'start' || eventDialog === 'start-then-new') && (
        <StartEventModal onClose={() => setEventDialog(null)} onStarted={() => eventDialog === 'start-then-new' && go({ name: 'new' })} />
      )}
      {eventDialog === 'end' && <EndEventModal onClose={() => setEventDialog(null)} onOpenMatch={(id) => go({ name: 'match', id })} />}
      {eventDialog === 'list' && <EventsListModal onClose={() => setEventDialog(null)} />}

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

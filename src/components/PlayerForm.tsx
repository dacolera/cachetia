import { useRef, useState } from 'react';
import type { Player } from '../domain/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { fileToAvatar } from './photo';
import { Modal } from './ui';

/** Cadastro ou edição de jogador, com foto tirada na hora pela câmera do tablet. */
export function PlayerForm({ player, onClose, onSaved }: { player?: Player; onClose: () => void; onSaved?: (p: Player) => void }) {
  const store = useStore();
  const [name, setName] = useState(player?.name ?? '');
  const [photo, setPhoto] = useState<string | undefined>(player?.photo);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const typed = name.trim();
  const duplicate = store.players.find((p) => p.id !== player?.id && p.name.toLowerCase() === typed.toLowerCase());

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await fileToAvatar(file));
      setError(null);
    } catch {
      setError('Não foi possível usar essa imagem.');
    }
  }

  function save() {
    if (!typed || duplicate) return;
    let saved: Player;
    if (player) {
      saved = { ...player, name: typed, photo };
      store.updatePlayer(player.id, { name: typed, photo });
    } else {
      saved = store.addPlayer(typed, photo);
    }
    onSaved?.(saved);
    onClose();
  }

  const fileInput = (ref: typeof cameraRef, capture: boolean) => (
    <input
      ref={ref}
      type="file"
      accept="image/*"
      {...(capture ? { capture: 'user' as const } : {})}
      hidden
      onChange={(e) => {
        void onFile(e.target.files?.[0]);
        e.target.value = '';
      }}
    />
  );

  return (
    <Modal
      title={player ? 'Editar jogador' : 'Novo jogador'}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!typed || !!duplicate} onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div className="player-form">
        <button className="photo-pick" onClick={() => cameraRef.current?.click()} aria-label="Tirar foto">
          <Avatar player={{ id: '', name: typed || '?', createdAt: '', photo }} className="avatar-xl" />
          <span className="photo-pick-hint">📷</span>
        </button>
        <div className="photo-actions">
          <button className="btn" onClick={() => cameraRef.current?.click()}>
            📷 Tirar foto
          </button>
          <button className="btn ghost" onClick={() => galleryRef.current?.click()}>
            Escolher da galeria
          </button>
          {photo && (
            <button className="btn ghost danger-text" onClick={() => setPhoto(undefined)}>
              Remover foto
            </button>
          )}
        </div>
        {fileInput(cameraRef, true)}
        {fileInput(galleryRef, false)}
      </div>

      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" maxLength={20} autoFocus={!player} />
      {duplicate && (
        <p className="error">
          {duplicate.archived ? 'Esse nome é de um jogador arquivado. Restaure-o na lista de arquivados.' : 'Já existe um jogador com esse nome.'}
        </p>
      )}
      {player && (
        <button
          className="btn ghost danger-text archive-btn"
          onClick={() => {
            store.updatePlayer(player.id, { archived: !player.archived });
            onClose();
          }}
        >
          {player.archived ? 'Restaurar jogador' : 'Arquivar jogador'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

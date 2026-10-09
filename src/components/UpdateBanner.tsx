import { useRegisterSW } from 'virtual:pwa-register/react';

/** De quanto em quanto tempo, com o app aberto, procura versão nova. */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/**
 * No iPad o app instalado quase nunca recarrega do zero: ele volta de onde estava.
 * Por isso a busca por versão nova acontece sempre que o app volta para a tela,
 * e a troca só ocorre quando a pessoa confirma.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (navigator.onLine) void registration.update();
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, CHECK_EVERY_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <div className="update-banner" role="status">
      <span>Versão nova disponível</span>
      <button className="btn primary" onClick={() => void updateServiceWorker(true)}>
        Atualizar
      </button>
    </div>
  );
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // O app avisa que há versão nova e só recarrega quando a pessoa toca em Atualizar,
      // para não perder um lançamento de rodada pela metade.
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Cacheta da Família',
        short_name: 'Cacheta',
        description: 'Marcador de pontos da cacheta familiar',
        lang: 'pt-BR',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f3d2e',
        theme_color: '#0f3d2e',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import {
  buildChecklists,
  CHECKLISTS_DIR,
} from './scripts/checklists-lib.ts';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
) as { version: string };

function logChecklistResult(result: ReturnType<typeof buildChecklists>): void {
  for (const warning of result.warnings) {
    console.warn(`checklist warning: ${warning.file}: ${warning.message}`);
  }
  console.log(
    `checklists: compiled ${result.files.length} checklist${result.files.length === 1 ? '' : 's'}`,
  );
}

/** Build checklists once for `vite build` even if the package script was skipped. */
function checklistBuildPlugin(): Plugin {
  return {
    name: 'ra-checklist-build',
    apply: 'build',
    buildStart() {
      try {
        logChecklistResult(buildChecklists());
      } catch (error) {
        this.error(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

/** Compile checklists before serving, and watch the source folder. */
function checklistDevPlugin(): Plugin {
  return {
    name: 'ra-checklist-dev',
    apply: 'serve',
    configureServer(server) {
      const watchDir = path.resolve(CHECKLISTS_DIR);
      try {
        logChecklistResult(buildChecklists());
      } catch (error) {
        server.config.logger.error(
          error instanceof Error ? error.message : String(error),
        );
      }

      server.watcher.add(watchDir);
      let timer: ReturnType<typeof setTimeout> | null = null;

      server.watcher.on('all', (event, file) => {
        const absolute = path.resolve(file);
        if (!absolute.startsWith(watchDir)) return;
        if (event !== 'add' && event !== 'change' && event !== 'unlink') return;
        if (!/\.ya?ml$/i.test(absolute)) return;

        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          try {
            logChecklistResult(buildChecklists());
            server.ws.send({ type: 'full-reload' });
          } catch (error) {
            server.config.logger.error(
              error instanceof Error ? error.message : String(error),
            );
          }
        }, 150);
      });
    },
  };
}

const basePath = process.env.VITE_BASE_PATH?.trim() || '/';

export default defineConfig({
  base: basePath,
  resolve: {
    alias: {
      $lib: path.resolve(rootDir, 'src/lib'),
      $components: path.resolve(rootDir, 'src/components'),
      $routes: path.resolve(rootDir, 'src/routes'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    svelte(),
    checklistBuildPlugin(),
    checklistDevPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'favicon.svg',
        'icons/icon-180.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
      ],
      manifest: {
        name: 'RA Planner',
        short_name: 'RA Planner',
        description:
          'Order-dependent checklists for RetroAchievements, with offline support and cross-device sync.',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0e1117',
        background_color: '#0e1117',
        categories: ['games', 'productivity'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,webmanifest,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/media\.retroachievements\.org\/Badge\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ra-badge-images',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});

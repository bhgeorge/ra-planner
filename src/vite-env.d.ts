/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_RA_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_UI_SKIN?: 'classic' | 'modern';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AVALON_SERVER?: string;
  readonly VITE_AI_BFF_URL?: string;
  readonly VITE_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

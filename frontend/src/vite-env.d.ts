/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  // 'false' bypasses MSW to use the real backend; anything else keeps mocks on in dev.
  readonly VITE_ENABLE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

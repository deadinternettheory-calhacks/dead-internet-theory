/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL of the v1 API, e.g. https://<deployment>.convex.site. Not a secret. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

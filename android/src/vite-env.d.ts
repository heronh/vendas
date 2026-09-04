/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_PAIRING_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

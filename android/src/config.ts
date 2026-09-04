/** URL HTTPS da API no Cloud Run. Sobrescreva com VITE_API_URL no build. */
export const CLOUD_API_URL = (
  import.meta.env.VITE_API_URL?.trim() || 'https://vendas-api-948744344816.us-central1.run.app'
).replace(/\/$/, '')

/** Código de pareamento estável da clínica. Sobrescreva com VITE_PAIRING_CODE. */
export const CLOUD_PAIRING_CODE = import.meta.env.VITE_PAIRING_CODE?.trim() || '260160'

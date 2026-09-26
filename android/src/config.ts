const demoBuild = import.meta.env.VITE_DEMO === 'true'

/** URL HTTPS da API no Cloud Run. Sobrescreva com VITE_API_URL no build. A demo não leva essa URL. */
export const CLOUD_API_URL = (
  demoBuild
    ? ''
    : import.meta.env.VITE_API_URL?.trim() || 'https://vendas-api-948744344816.us-central1.run.app'
).replace(/\/$/, '')

/** Código de pareamento estável da clínica. Sobrescreva com VITE_PAIRING_CODE. A demo não leva esse código. */
export const CLOUD_PAIRING_CODE = demoBuild
  ? ''
  : import.meta.env.VITE_PAIRING_CODE?.trim() || '260160'

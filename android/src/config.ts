/** URL HTTPS da API no Cloud Run. Sobrescreva com VITE_API_URL no build. */
export const CLOUD_API_URL = (
  import.meta.env.VITE_API_URL?.trim() || 'https://vendas-api-948744344816.us-central1.run.app'
).replace(/\/$/, '')

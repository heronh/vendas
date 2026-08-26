import { onlyDigits } from '../format'

export interface CepAddress {
  street: string
  neighborhood: string
  city: string
  state: string
}

export async function lookupCep(cep: string): Promise<CepAddress> {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) {
    throw new Error('CEP deve ter 8 dígitos')
  }
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
  if (!response.ok) {
    throw new Error('Falha ao consultar o CEP')
  }
  const data = (await response.json()) as {
    erro?: boolean
    logradouro?: string
    bairro?: string
    localidade?: string
    uf?: string
  }
  if (data.erro) {
    throw new Error('CEP não encontrado')
  }
  return {
    street: data.logradouro ?? '',
    neighborhood: data.bairro ?? '',
    city: data.localidade ?? '',
    state: data.uf ?? '',
  }
}

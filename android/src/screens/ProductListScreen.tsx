import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, EmptyState, Topbar } from '../components/ui'
import { db } from '../db'
import { formatBRL } from '../format'
import type { Product } from '../types'

export function ProductListScreen() {
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    db.products.orderBy('description').toArray().then(setProducts)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR')
    if (!q) return products
    return products.filter(
      (product) =>
        product.description.toLocaleLowerCase('pt-BR').includes(q) ||
        product.barcode.toLowerCase().includes(q) ||
        product.supplier.toLocaleLowerCase('pt-BR').includes(q),
    )
  }, [products, query])

  return (
    <main>
      <Topbar
        title="Produtos"
        backTo="/menu"
        action={
          <Link to="/produtos/novo" className="icon-btn" aria-label="Novo produto">
            +
          </Link>
        }
      />
      <input
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por descrição, código ou fornecedor"
      />
      {filtered.length === 0 ? (
        <EmptyState title="Nenhum produto cadastrado">
          Inclua o catálogo para lançar vendas com preço sugerido.
        </EmptyState>
      ) : (
        <div className="stack">
          {filtered.map((product) => (
            <article key={product.id} className="product-card">
              <h2>{product.description}</h2>
              <p className="muted">
                {product.supplier || 'Sem fornecedor'}
                {product.barcode ? ` · ${product.barcode}` : ''}
              </p>
              <p className="balance zero">Venda: {formatBRL(product.salePriceCents)}</p>
              <Link to={`/produtos/${product.id}/editar`}>
                <Button variant="ghost">Editar</Button>
              </Link>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}

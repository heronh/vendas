import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScannerModal } from '../components/ScannerModal'
import { Button, Field, Topbar } from '../components/ui'
import { db, newId } from '../db'
import { centsToInput, formatBRL, fromDatetimeLocalValue, parseMoneyToCents, toDatetimeLocalValue } from '../format'
import type { Client, Product } from '../types'

export function SaleScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState<Client | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('')
  const [when, setWhen] = useState(toDatetimeLocalValue(Date.now()))
  const [error, setError] = useState('')
  const [openList, setOpenList] = useState(false)
  const [scan, setScan] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([db.clients.get(id), db.products.orderBy('description').toArray()]).then(
      ([found, catalog]) => {
        setClient(found ?? null)
        setProducts(catalog)
        setLoading(false)
      },
    )
  }, [id])

  const suggestions = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('pt-BR')
    if (!q) return products.slice(0, 8)
    return products
      .filter(
        (item) =>
          item.description.toLocaleLowerCase('pt-BR').includes(q) ||
          item.barcode.toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [products, search])

  function selectProduct(item: Product) {
    setProduct(item)
    setSearch(item.description)
    setUnit(centsToInput(item.salePriceCents))
    setOpenList(false)
  }

  function applyBarcode(code: string) {
    const found = products.find((item) => item.barcode && item.barcode === code)
    if (!found) {
      setError('Produto não encontrado para este código')
      setScan(false)
      return
    }
    selectProduct(found)
    setError('')
    setScan(false)
  }

  const qty = Math.max(0, Number(quantity.replace(',', '.')) || 0)
  const unitCents = parseMoneyToCents(unit)
  const totalCents = Math.round(qty * unitCents)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!id || !client) return
    if (!search.trim()) {
      setError('Selecione um produto')
      return
    }
    if (qty <= 0) {
      setError('Quantidade deve ser maior que zero')
      return
    }
    await db.sales.add({
      id: newId(),
      clientId: id,
      productId: product?.id,
      productDescription: product?.description ?? search.trim(),
      quantity: qty,
      unitPriceCents: unitCents,
      totalCents,
      occurredAt: fromDatetimeLocalValue(when),
      createdAt: Date.now(),
    })
    navigate(`/clientes/${id}/resumo`)
  }

  if (loading) {
    return (
      <main>
        <Topbar title="Registrar Venda" backTo="/clientes" />
        <p className="muted">Carregando…</p>
      </main>
    )
  }

  if (!client) {
    return (
      <main>
        <Topbar title="Registrar Venda" backTo="/clientes" />
        <p className="error">Cliente não encontrado.</p>
      </main>
    )
  }

  return (
    <main>
      <Topbar title="Registrar Venda" backTo="/clientes" />
      <p className="muted" style={{ marginTop: 0 }}>
        Cliente: <strong>{client.fullName}</strong>
      </p>
      <form className="stack" onSubmit={onSubmit}>
        <div className="field autocomplete">
          <span className="field-label">Produto</span>
          <div className="cep-row">
            <input
              value={search}
              placeholder="Selecione / busque..."
              onChange={(e) => {
                setSearch(e.target.value)
                setProduct(null)
                setOpenList(true)
              }}
              onFocus={() => setOpenList(true)}
            />
            <Button variant="navy" block={false} onClick={() => setScan(true)}>
              📷 Esc
            </Button>
          </div>
          {openList && suggestions.length > 0 ? (
            <div className="suggest">
              {suggestions.map((item) => (
                <button key={item.id} type="button" onClick={() => selectProduct(item)}>
                  {item.description}
                  <div className="muted">{formatBRL(item.salePriceCents)}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="row">
          <Field label="Quantidade">
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Valor unitário">
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
        </div>
        <Field label="Data/hora">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </Field>
        <div className="total-box">
          <span>Total</span>
          <strong>{formatBRL(totalCents)}</strong>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit">
          Confirmar venda
        </button>
      </form>
      {scan ? (
        <ScannerModal
          title="Incluir produto pelo código"
          onClose={() => setScan(false)}
          onDetect={applyBarcode}
        />
      ) : null}
    </main>
  )
}

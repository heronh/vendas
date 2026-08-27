import { ChangeEvent, FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScannerModal } from '../components/ScannerModal'
import { Button, Field, Topbar } from '../components/ui'
import { db, newId } from '../db'
import { centsToInput, parseMoneyToCents, resizeImage } from '../format'
import type { Product } from '../types'

const empty = {
  description: '',
  supplier: '',
  cost: '',
  sale: '',
  barcode: '',
  imageDataUrl: '' as string | undefined,
}

export function ProductFormScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [scan, setScan] = useState(false)

  useEffect(() => {
    if (!id) return
    db.products.get(id).then((product) => {
      if (!product) {
        setError('Produto não encontrado')
        return
      }
      setForm({
        description: product.description,
        supplier: product.supplier,
        cost: centsToInput(product.costPriceCents),
        sale: centsToInput(product.salePriceCents),
        barcode: product.barcode,
        imageDataUrl: product.imageDataUrl,
      })
    })
  }, [id])

  async function onImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await resizeImage(file)
      setForm((current) => ({ ...current, imageDataUrl: dataUrl }))
    } catch {
      setError('Não foi possível anexar a imagem')
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.description.trim()) {
      setError('Informe a descrição do produto')
      return
    }
    const now = Date.now()
    const payload: Product = {
      id: id ?? newId(),
      description: form.description.trim(),
      supplier: form.supplier.trim(),
      costPriceCents: parseMoneyToCents(form.cost),
      salePriceCents: parseMoneyToCents(form.sale),
      barcode: form.barcode.trim(),
      imageDataUrl: form.imageDataUrl,
      createdAt: now,
      updatedAt: now,
    }
    if (editing && id) {
      const current = await db.products.get(id)
      if (!current) {
        setError('Produto não encontrado')
        return
      }
      payload.createdAt = current.createdAt
      await db.products.put(payload)
    } else {
      await db.products.add(payload)
    }
    navigate('/produtos')
  }

  return (
    <main>
      <Topbar
        title={editing ? 'Editar Produto' : 'Cadastro de Produto'}
        backTo="/menu"
        action={
          <button type="button" className="icon-btn" onClick={() => navigate('/produtos')} aria-label="Lista">
            ≡
          </button>
        }
      />
      <form className="stack" onSubmit={onSubmit}>
        <Field label="Descrição">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </Field>
        <Field label="Fornecedor">
          <input
            value={form.supplier}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
        </Field>
        <Field label="Código de barras / QR Code">
          <div className="cep-row">
            <input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="Digite ou escaneie"
            />
            <Button variant="navy" block={false} onClick={() => setScan(true)}>
              📷 Escan
            </Button>
          </div>
        </Field>
        <div className="row">
          <Field label="Preço de custo">
            <input
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
          <Field label="Preço de venda">
            <input
              value={form.sale}
              onChange={(e) => setForm({ ...form, sale: e.target.value })}
              inputMode="decimal"
              placeholder="0,00"
            />
          </Field>
        </div>
        <div className="field">
          <span className="field-label">Imagem do produto</span>
          {form.imageDataUrl ? (
            <img className="preview" src={form.imageDataUrl} alt="Pré-visualização do produto" />
          ) : (
            <div className="preview" />
          )}
          <label className="btn btn-ghost file-btn">
            + Anexar foto (galeria/câmera)
            <input type="file" accept="image/*" capture="environment" onChange={onImage} />
          </label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit">
          Salvar produto
        </button>
      </form>
      {scan ? (
        <ScannerModal
          title="Ler código do produto"
          onClose={() => setScan(false)}
          onDetect={(value) => {
            setForm((current) => ({ ...current, barcode: value }))
            setScan(false)
          }}
        />
      ) : null}
    </main>
  )
}

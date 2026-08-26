import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Topbar } from '../components/ui'

type DemoField = { label: string; value: string }
type DemoKind = 'form' | 'sale' | 'payment'

interface Scene {
  kind: DemoKind
  title: string
  caption: string
  screenTitle: string
  fields: DemoField[]
  button: string
}

const SCENES: Scene[] = [
  {
    kind: 'form',
    title: 'Passo 1 · Cliente',
    caption: 'Cadastre a cliente com nome, contato e endereço. O CEP preenche cidade e rua.',
    screenTitle: 'Cadastro de Cliente',
    fields: [
      { label: 'Nome completo', value: 'Ana Beatriz Costa' },
      { label: 'Nome fantasia', value: 'Ana' },
      { label: 'Telefone', value: '(12) 98888-1122' },
      { label: 'CEP', value: '12243-001' },
      { label: 'Cidade / UF', value: 'São José dos Campos / SP' },
    ],
    button: 'Salvar cadastro',
  },
  {
    kind: 'form',
    title: 'Passo 2 · Produto',
    caption: 'Inclua o procedimento no catálogo, com preço de venda e código de barras.',
    screenTitle: 'Cadastro de Produto',
    fields: [
      { label: 'Descrição', value: 'Limpeza de pele profunda' },
      { label: 'Fornecedor', value: 'Beauty Brasil SJC' },
      { label: 'Código de barras', value: '7891234567890' },
      { label: 'Preço de custo', value: 'R$ 80,00' },
      { label: 'Preço de venda', value: 'R$ 180,00' },
    ],
    button: 'Salvar produto',
  },
  {
    kind: 'sale',
    title: 'Passo 3 · Venda',
    caption: 'Na lista, toque em Lançar. Busque o produto; o valor unitário vem do cadastro.',
    screenTitle: 'Registrar Venda',
    fields: [
      { label: 'Produto', value: 'Limpeza de pele profunda' },
      { label: 'Quantidade', value: '1' },
      { label: 'Valor unitário', value: 'R$ 180,00' },
    ],
    button: 'Confirmar venda',
  },
  {
    kind: 'payment',
    title: 'Passo 4 · Pagamento',
    caption: 'Na conta corrente, registre um abate. O saldo cai, mas a venda permanece no histórico.',
    screenTitle: 'Conta corrente',
    fields: [{ label: 'Valor do pagamento', value: 'R$ 80,00' }],
    button: 'Salvar pagamento',
  },
]

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(media.matches)
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function HelpScreen() {
  const reducedMotion = usePrefersReducedMotion()
  const [sceneIndex, setSceneIndex] = useState(0)
  const [fieldIndex, setFieldIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)

  const scene = SCENES[Math.min(sceneIndex, SCENES.length - 1)]
  const charDelay = reducedMotion ? 0 : 32
  const fieldPause = reducedMotion ? 0 : 420
  const savePause = reducedMotion ? 200 : 1100

  const reset = useCallback(() => {
    setSceneIndex(0)
    setFieldIndex(0)
    setTyped(0)
    setSaving(false)
    setDone(false)
    setPaused(false)
    setRunId((id) => id + 1)
  }, [])

  useEffect(() => {
    if (paused || done) return
    const current = SCENES[sceneIndex]
    if (!current) {
      setDone(true)
      return
    }
    const field = current.fields[fieldIndex]
    if (field && typed < field.value.length) {
      const timer = window.setTimeout(() => setTyped((n) => n + 1), charDelay || 16)
      return () => window.clearTimeout(timer)
    }
    if (field && typed >= field.value.length) {
      const timer = window.setTimeout(() => {
        setFieldIndex((i) => i + 1)
        setTyped(0)
      }, fieldPause || 16)
      return () => window.clearTimeout(timer)
    }
    if (!saving) {
      const timer = window.setTimeout(() => setSaving(true), reducedMotion ? 80 : 380)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      if (sceneIndex >= SCENES.length - 1) {
        setDone(true)
        setSaving(false)
        return
      }
      setSaving(false)
      setSceneIndex((i) => i + 1)
      setFieldIndex(0)
      setTyped(0)
    }, savePause)
    return () => window.clearTimeout(timer)
  }, [sceneIndex, fieldIndex, typed, saving, paused, done, charDelay, fieldPause, savePause, reducedMotion, runId])

  const filled = useMemo(() => {
    return scene.fields.map((field, index) => {
      if (index < fieldIndex) return field.value
      if (index === fieldIndex) return field.value.slice(0, typed)
      return ''
    })
  }, [scene, fieldIndex, typed])

  const highlighting = !saving && !done && fieldIndex < scene.fields.length

  return (
    <main>
      <Topbar title="Ajuda" backTo="/menu" />
      <p className="muted" style={{ marginTop: 0 }}>
        Demonstração fictícia. Nada é gravado no cadastro real.
      </p>

      <div className="help-progress" aria-hidden>
        {SCENES.map((item, index) => (
          <span
            key={item.title}
            className={`help-dot${index === sceneIndex && !done ? ' is-active' : ''}${index < sceneIndex || done ? ' is-done' : ''}`}
          />
        ))}
      </div>
      <p className="help-step-title">{done ? 'Fluxo completo' : scene.title}</p>
      <p className="help-caption">{done ? 'Cliente, produto, venda e pagamento parcial — nessa ordem.' : scene.caption}</p>

      <div className="help-phone" aria-live="polite" key={done ? 'done' : sceneIndex}>
        <div className="help-phone-bar">{scene.screenTitle}</div>
        {scene.kind !== 'payment' ? (
          <div className="help-fields">
            {scene.kind === 'sale' ? (
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Cliente: <strong>Ana Beatriz Costa</strong>
              </p>
            ) : null}
            {scene.fields.map((field, index) => (
              <div
                key={field.label}
                className={`help-field${highlighting && index === fieldIndex ? ' is-typing' : ''}${index < fieldIndex ? ' is-filled' : ''}`}
              >
                <span>{field.label}</span>
                <div>
                  {filled[index]}
                  {highlighting && index === fieldIndex ? <i className="help-caret" /> : null}
                </div>
              </div>
            ))}
            {scene.kind === 'sale' ? (
              <div className="total-box" style={{ paddingTop: 8 }}>
                <span>Total</span>
                <strong>R$ 180,00</strong>
              </div>
            ) : null}
          </div>
        ) : (
          <PaymentDemo
            amountTyped={filled[0] ?? ''}
            typing={highlighting}
            saving={saving}
            done={done}
          />
        )}
        <div className={`help-save${saving ? ' is-pressed' : ''}`}>{scene.button}</div>
      </div>

      <div className="stack" style={{ marginTop: 14 }}>
        <Button variant="ghost" onClick={() => setPaused((value) => !value)} disabled={done}>
          {paused ? 'Continuar animação' : 'Pausar'}
        </Button>
        <Button variant="navy" onClick={reset}>
          Recomeçar
        </Button>
      </div>
    </main>
  )
}

function PaymentDemo({
  amountTyped,
  typing,
  saving,
  done,
}: {
  amountTyped: string
  typing: boolean
  saving: boolean
  done: boolean
}) {
  const paid = saving || done
  return (
    <div className="help-fields">
      <div className="hero-balance" style={{ marginBottom: 10, padding: '14px 10px' }}>
        <small>Saldo devedor atual</small>
        <strong>{paid ? 'R$ 100,00' : 'R$ 180,00'}</strong>
      </div>
      <div className={`help-field${typing ? ' is-typing' : ''}${paid ? ' is-filled' : ''}`}>
        <span>Valor do pagamento</span>
        <div>
          {amountTyped}
          {typing ? <i className="help-caret" /> : null}
        </div>
      </div>
      <div className="history" style={{ marginTop: 8 }}>
        <article className="history-item">
          <div>
            <span className="badge badge-sale">(+) Venda</span>
            <div style={{ marginTop: 4 }}>Limpeza de pele profunda</div>
          </div>
          <strong>+R$ 180,00</strong>
        </article>
        {paid ? (
          <article className="history-item help-pay-in">
            <div>
              <span className="badge badge-pay">(−) Pagamento</span>
              <div style={{ marginTop: 4 }}>Pagamento / abate</div>
            </div>
            <strong>−R$ 80,00</strong>
          </article>
        ) : null}
      </div>
    </div>
  )
}

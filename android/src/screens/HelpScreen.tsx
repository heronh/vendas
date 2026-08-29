import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Topbar } from '../components/ui'

type DemoField = { label: string; value: string }
type SceneKind = 'menu' | 'form' | 'clients' | 'products' | 'sale' | 'payment'
type ListAction = 'back' | 'lancar'

interface Scene {
  kind: SceneKind
  step: number
  title: string
  caption: string
  screenTitle: string
  highlight?: string
  action?: ListAction
  fields?: DemoField[]
  button?: string
  due?: string
}

const MENU_ITEMS = [
  { icon: '+', title: 'Cadastrar Cliente', subtitle: 'Nome, contato e endereço com CEP' },
  { icon: '▣', title: 'Cadastrar Produto', subtitle: 'Preços, código de barras e foto' },
  { icon: '👥', title: 'Lista de Clientes', subtitle: 'Lançamentos, edição e conta corrente' },
]

const SCENES: Scene[] = [
  {
    kind: 'menu',
    step: 0,
    title: 'Passo 1 · Cliente',
    caption: 'No Menu Principal, toque em Cadastrar Cliente.',
    screenTitle: 'Menu Principal',
    highlight: 'Cadastrar Cliente',
  },
  {
    kind: 'form',
    step: 0,
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
    kind: 'clients',
    step: 0,
    title: 'Passo 1 · Cliente',
    caption: 'Ao salvar, a lista de clientes abre. Toque em voltar para o menu.',
    screenTitle: 'Clientes',
    action: 'back',
    due: 'R$ 0,00',
  },
  {
    kind: 'menu',
    step: 1,
    title: 'Passo 2 · Produto',
    caption: 'De volta ao menu, toque em Cadastrar Produto.',
    screenTitle: 'Menu Principal',
    highlight: 'Cadastrar Produto',
  },
  {
    kind: 'form',
    step: 1,
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
    kind: 'products',
    step: 1,
    title: 'Passo 2 · Produto',
    caption: 'O produto entra na lista. Volte ao menu para registrar a venda.',
    screenTitle: 'Produtos',
    action: 'back',
  },
  {
    kind: 'menu',
    step: 2,
    title: 'Passo 3 · Venda',
    caption: 'Toque em Lista de Clientes para lançar a venda.',
    screenTitle: 'Menu Principal',
    highlight: 'Lista de Clientes',
  },
  {
    kind: 'clients',
    step: 2,
    title: 'Passo 3 · Venda',
    caption: 'Na ficha da Ana, toque em Lançar.',
    screenTitle: 'Clientes',
    action: 'lancar',
    due: 'R$ 0,00',
  },
  {
    kind: 'sale',
    step: 2,
    title: 'Passo 3 · Venda',
    caption: 'Busque o produto; o valor unitário vem do cadastro.',
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
    step: 3,
    title: 'Passo 4 · Pagamento',
    caption: 'A venda abre a conta corrente. Registre um abate; o saldo cai e o histórico permanece.',
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

function isFormScene(kind: SceneKind) {
  return kind === 'form' || kind === 'sale' || kind === 'payment'
}

export function HelpScreen() {
  const reducedMotion = usePrefersReducedMotion()
  const [sceneIndex, setSceneIndex] = useState(0)
  const [fieldIndex, setFieldIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [saving, setSaving] = useState(false)
  const [tapping, setTapping] = useState(false)
  const [done, setDone] = useState(false)
  const [paused, setPaused] = useState(false)
  const [runId, setRunId] = useState(0)

  const scene = SCENES[Math.min(sceneIndex, SCENES.length - 1)]
  const charDelay = reducedMotion ? 0 : 85
  const fieldPause = reducedMotion ? 0 : 1100
  const savePause = reducedMotion ? 200 : 2200
  const navHold = reducedMotion ? 120 : 1800
  const tapHold = reducedMotion ? 80 : 750

  const goNext = useCallback(() => {
    if (sceneIndex >= SCENES.length - 1) {
      setDone(true)
      setSaving(false)
      setTapping(false)
      return
    }
    setSaving(false)
    setTapping(false)
    setSceneIndex((i) => i + 1)
    setFieldIndex(0)
    setTyped(0)
  }, [sceneIndex])

  const reset = useCallback(() => {
    setSceneIndex(0)
    setFieldIndex(0)
    setTyped(0)
    setSaving(false)
    setTapping(false)
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

    if (!isFormScene(current.kind)) {
      if (!tapping) {
        const timer = window.setTimeout(() => setTapping(true), navHold)
        return () => window.clearTimeout(timer)
      }
      const timer = window.setTimeout(goNext, tapHold)
      return () => window.clearTimeout(timer)
    }

    const fields = current.fields ?? []
    const field = fields[fieldIndex]
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
      const timer = window.setTimeout(() => setSaving(true), reducedMotion ? 80 : 900)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(goNext, savePause)
    return () => window.clearTimeout(timer)
  }, [
    sceneIndex,
    fieldIndex,
    typed,
    saving,
    tapping,
    paused,
    done,
    charDelay,
    fieldPause,
    savePause,
    navHold,
    tapHold,
    reducedMotion,
    runId,
    goNext,
  ])

  const filled = useMemo(() => {
    const fields = scene.fields ?? []
    return fields.map((field, index) => {
      if (index < fieldIndex) return field.value
      if (index === fieldIndex) return field.value.slice(0, typed)
      return ''
    })
  }, [scene, fieldIndex, typed])

  const highlighting = isFormScene(scene.kind) && !saving && !done && fieldIndex < (scene.fields?.length ?? 0)
  const showBack = scene.kind !== 'menu'

  return (
    <main>
      <Topbar title="Ajuda" backTo="/menu" />
      <p className="muted" style={{ marginTop: 0 }}>
        Demonstração fictícia. Nada é gravado no cadastro real.
      </p>

      <div className="help-progress" aria-hidden>
        {Array.from({ length: 4 }, (_, index) => (
          <span
            key={index}
            className={`help-dot${index === scene.step && !done ? ' is-active' : ''}${index < scene.step || done ? ' is-done' : ''}`}
          />
        ))}
      </div>
      <p className="help-step-title">{done ? 'Fluxo completo' : scene.title}</p>
      <p className="help-caption">
        {done
          ? 'Menu, cadastros, lista, venda e pagamento parcial — nessa ordem.'
          : scene.caption}
      </p>

      <div className="help-phone" aria-live="polite" key={done ? 'done' : sceneIndex}>
        <div className="help-phone-bar">
          {showBack ? (
            <span
              className={`help-back${tapping && scene.action === 'back' ? ' is-pressed' : ''}`}
              aria-hidden
            >
              ‹
            </span>
          ) : (
            <span className="help-back-spacer" />
          )}
          <span className="help-phone-title">{scene.screenTitle}</span>
          <span className="help-back-spacer" />
        </div>

        {scene.kind === 'menu' ? (
          <MenuDemo highlight={scene.highlight} tapping={tapping} />
        ) : null}
        {scene.kind === 'clients' ? (
          <ClientsDemo due={scene.due ?? 'R$ 0,00'} action={scene.action} tapping={tapping} />
        ) : null}
        {scene.kind === 'products' ? <ProductsDemo /> : null}
        {scene.kind === 'form' || scene.kind === 'sale' ? (
          <div className="help-fields">
            {scene.kind === 'sale' ? (
              <p className="muted" style={{ margin: '0 0 8px' }}>
                Cliente: <strong>Ana Beatriz Costa</strong>
              </p>
            ) : null}
            {(scene.fields ?? []).map((field, index) => (
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
        ) : null}
        {scene.kind === 'payment' ? (
          <PaymentDemo
            amountTyped={filled[0] ?? ''}
            typing={highlighting}
            saving={saving}
            done={done}
          />
        ) : null}

        {scene.button ? (
          <div className={`help-save${saving ? ' is-pressed' : ''}`}>{scene.button}</div>
        ) : null}
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

function MenuDemo({ highlight, tapping }: { highlight?: string; tapping: boolean }) {
  return (
    <div className="help-menu">
      {MENU_ITEMS.map((item) => {
        const target = item.title === highlight
        return (
          <div
            key={item.title}
            className={`help-menu-item${target ? ' is-target' : ''}${target && tapping ? ' is-pressed' : ''}`}
          >
            <span className="help-menu-ico" aria-hidden>
              {item.icon}
            </span>
            <span>
              <strong>{item.title}</strong>
              <em>{item.subtitle}</em>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ClientsDemo({
  due,
  action,
  tapping,
}: {
  due: string
  action?: ListAction
  tapping: boolean
}) {
  const paidOff = due === 'R$ 0,00'
  return (
    <div className="help-fields">
      <article className="help-card">
        <h3>Ana Beatriz Costa</h3>
        <p className="muted">Ana</p>
        <p className={`balance ${paidOff ? 'zero' : 'due'}`}>Saldo devedor: {due}</p>
        <div className="help-mini-actions">
          <span className={`help-mini-btn is-navy${action === 'lancar' && tapping ? ' is-pressed' : ''}${action === 'lancar' && !tapping ? ' is-target' : ''}`}>
            Lançar
          </span>
          <span className="help-mini-btn">Editar</span>
          <span className="help-mini-btn">Ver</span>
        </div>
      </article>
    </div>
  )
}

function ProductsDemo() {
  return (
    <div className="help-fields">
      <article className="help-card">
        <h3>Limpeza de pele profunda</h3>
        <p className="muted">Beauty Brasil SJC</p>
        <p className="balance zero">Venda: R$ 180,00</p>
      </article>
    </div>
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
      <p className="muted" style={{ margin: '0 0 8px' }}>
        Ana Beatriz Costa
      </p>
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

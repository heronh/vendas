import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function Topbar({
  title,
  backTo,
  action,
}: {
  title: string
  backTo?: string
  action?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn"
        aria-label="Voltar"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
      >
        ‹
      </button>
      <h1>{title}</h1>
      {action ?? <span style={{ width: 42 }} />}
    </header>
  )
}

export function Button({
  variant = 'primary',
  block = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'navy' | 'ghost' | 'danger'
  block?: boolean
}) {
  const classes = ['btn', `btn-${variant}`, block ? '' : 'btn-sm']
    .filter(Boolean)
    .join(' ')
  return <button type="button" className={classes} {...props} />
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty card">
      <strong>{title}</strong>
      {children ? <p className="muted">{children}</p> : null}
    </div>
  )
}

export function MenuLink({
  to,
  icon,
  title,
  subtitle,
}: {
  to: string
  icon: ReactNode
  title: string
  subtitle: string
}) {
  return (
    <Link className="menu-item" to={to}>
      <span className="menu-ico" aria-hidden>
        {icon}
      </span>
      <span className="menu-item-text">
        <strong>{title}</strong>
        <span className="menu-item-sub">{subtitle}</span>
      </span>
    </Link>
  )
}

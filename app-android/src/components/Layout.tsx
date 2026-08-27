import { Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="app-shell">
      <div className="watermark" aria-hidden />
      <Outlet />
    </div>
  )
}

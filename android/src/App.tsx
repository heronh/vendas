import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { isDefaultPassword, isUnlocked } from './auth'
import { Layout } from './components/Layout'
import { AccountScreen } from './screens/AccountScreen'
import { BackupScreen } from './screens/BackupScreen'
import { ChangePasswordScreen } from './screens/ChangePasswordScreen'
import { ClientFormScreen } from './screens/ClientFormScreen'
import { ClientListScreen } from './screens/ClientListScreen'
import { HelpScreen } from './screens/HelpScreen'
import { MenuScreen } from './screens/MenuScreen'
import { ProductFormScreen } from './screens/ProductFormScreen'
import { ProductListScreen } from './screens/ProductListScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { RegisterScreen } from './screens/RegisterScreen'
import { ReportsScreen } from './screens/ReportsScreen'
import { SaleScreen } from './screens/SaleScreen'
import { SplashScreen } from './screens/SplashScreen'

function RequireSession({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'load' | 'login' | 'register' | 'ok'>('load')

  useEffect(() => {
    void isDefaultPassword().then((def) => {
      if (def) setState('register')
      else if (!isUnlocked()) setState('login')
      else setState('ok')
    })
  }, [])

  if (state === 'load') return null
  if (state === 'register') return <Navigate to="/cadastro" replace />
  if (state === 'login') return <Navigate to="/" replace />
  return children
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route
          path="/cadastro"
          element={
            <div className="app-shell">
              <RegisterScreen />
            </div>
          }
        />
        <Route
          path="/senha"
          element={
            <div className="app-shell">
              <ChangePasswordScreen />
            </div>
          }
        />
        <Route
          element={
            <RequireSession>
              <Layout />
            </RequireSession>
          }
        >
          <Route path="/menu" element={<MenuScreen />} />
          <Route path="/clientes" element={<ClientListScreen />} />
          <Route path="/clientes/novo" element={<ClientFormScreen />} />
          <Route path="/clientes/:id/editar" element={<ClientFormScreen />} />
          <Route path="/clientes/:id/lancamentos" element={<SaleScreen />} />
          <Route path="/clientes/:id/resumo" element={<AccountScreen />} />
          <Route path="/produtos" element={<ProductListScreen />} />
          <Route path="/produtos/novo" element={<ProductFormScreen />} />
          <Route path="/produtos/:id/editar" element={<ProductFormScreen />} />
          <Route path="/relatorios" element={<ReportsScreen />} />
          <Route path="/backup" element={<BackupScreen />} />
          <Route path="/perfil" element={<ProfileScreen />} />
          <Route path="/ajuda" element={<HelpScreen />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

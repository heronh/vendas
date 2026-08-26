import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AccountScreen } from './screens/AccountScreen'
import { BackupScreen } from './screens/BackupScreen'
import { ClientFormScreen } from './screens/ClientFormScreen'
import { ClientListScreen } from './screens/ClientListScreen'
import { MenuScreen } from './screens/MenuScreen'
import { ProductFormScreen } from './screens/ProductFormScreen'
import { ProductListScreen } from './screens/ProductListScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { ReportsScreen } from './screens/ReportsScreen'
import { SaleScreen } from './screens/SaleScreen'
import { SplashScreen } from './screens/SplashScreen'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route element={<Layout />}>
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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

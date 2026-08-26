import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

async function registerAndroidBackButton() {
  if (!Capacitor.isNativePlatform()) return
  const { App: CapApp } = await import('@capacitor/app')
  await CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back()
      return
    }
    void CapApp.exitApp()
  })
}

void registerAndroidBackButton()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

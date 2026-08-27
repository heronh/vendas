import { useEffect, useRef } from 'react'
import { Button } from './ui'

export function ScannerModal({
  title,
  onClose,
  onDetect,
}: {
  title: string
  onClose: () => void
  onDetect: (value: string) => void
}) {
  const regionId = 'barcode-reader'
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect

  useEffect(() => {
    let stopped = false
    let scanner: { stop: () => Promise<void> } | undefined

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (stopped) return
      const instance = new Html5Qrcode(regionId)
      scanner = instance
      instance
        .start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: 240 },
          (decoded) => {
            if (stopped) return
            stopped = true
            onDetectRef.current(decoded)
            instance.stop().catch(() => undefined)
          },
          () => undefined,
        )
        .catch(() => undefined)
    })

    return () => {
      stopped = true
      scanner?.stop().catch(() => undefined)
    }
  }, [])

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2 style={{ fontFamily: 'var(--serif)', marginTop: 0 }}>{title}</h2>
        <p className="muted">Aponte a câmera para o código de barras ou QR Code.</p>
        <div id={regionId} className="scanner-wrap" />
        <div className="stack" style={{ marginTop: 12 }}>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  )
}

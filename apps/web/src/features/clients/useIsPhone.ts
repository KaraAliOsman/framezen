import { useEffect, useState } from 'react'

const PHONE_QUERY = '(max-width: 639px)'

/** Pantalla de teléfono (< 640 px): las hojas inferiores reemplazan a los diálogos. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE_QUERY).matches))
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY)
    if (!mq) return
    const onChange = () => setPhone(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return phone
}

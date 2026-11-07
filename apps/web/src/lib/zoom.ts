/** Zoom de toda la interfaz. Se recuerda en este navegador y se aplica al abrir la app. */
const STORAGE_KEY = 'dk-zoom'
const MIN = 50
const MAX = 200

function apply(percent: number): void {
  document.documentElement.style.setProperty('zoom', percent === 100 ? '' : String(percent / 100))
}

export function setZoom(percent: number): void {
  const value = Math.min(MAX, Math.max(MIN, Math.round(percent)))
  apply(value)
  try {
    if (value === 100) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, String(value))
  } catch {
    // Sin almacenamiento el zoom dura hasta recargar.
  }
}

export function restoreZoom(): void {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    if (value >= MIN && value <= MAX) apply(value)
  } catch {
    // Sin almacenamiento queda el zoom normal.
  }
}

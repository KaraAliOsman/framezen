import { createContext } from 'react'
import type { Me } from '@dekopen/shared'

/**
 * Contexto de la sesión, aparte de `auth.tsx` a propósito: este archivo casi nunca cambia, así que al
 * recargar código en desarrollo su identidad se mantiene. Si viviera en `auth.tsx`, Vite crearía un
 * contexto nuevo en cada recarga mientras <RequireAuth> sigue montado con el anterior, y `useSession`
 * fallaría en la barra lateral. En producción hay un solo módulo y ese fallo no existe.
 */
export const SessionContext = createContext<Me | null>(null)

import type { Org, Client } from '@framezen/shared'

/** Datos de la empresa que aparecen en los documentos (mismo recorte que el portal). */
export type DocOrg = Pick<Org, 'name' | 'legalName' | 'rut' | 'address' | 'city' | 'phone' | 'email' | 'website' | 'logo' | 'accent'>

/** Datos del cliente que aparecen en los documentos. */
export type DocClient = Pick<Client, 'name' | 'rut' | 'email' | 'phone' | 'address' | 'city'>

export interface DocMeta {
  label: string
  value: string
}

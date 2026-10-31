import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { humanError } from '../../lib/api'
import { useCreateClient } from '../../lib/hooks'
import { Button, Field, Input, Sheet, SheetContent, Textarea, toast } from '../../ui'
import { formatRut, rutHint } from './rut'
import { useIsPhone } from './useIsPhone'

const EMPTY = { name: '', phone: '', email: '', rut: '', address: '', city: '', notes: '' }

/** Cliente nuevo: solo el nombre hace falta; lo demás se completa cuando quieras. */
export function NewClientSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const phone = useIsPhone()
  const navigate = useNavigate()
  const create = useCreateClient()
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(EMPTY)
      setTouched(false)
    }
  }, [open])

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }))
  const nameMissing = !values.name.trim()

  const submit = () => {
    setTouched(true)
    if (nameMissing) return
    const body = Object.fromEntries(
      Object.entries({ ...values, rut: values.rut ? formatRut(values.rut) : '' }).filter(([, v]) => v.trim() !== ''),
    ) as typeof values
    create.mutate(body, {
      onSuccess: (client) => {
        onOpenChange(false)
        toast.success(`Agregaste a ${client.name}`)
        navigate(`/clientes/${client.id}`)
      },
      onError: (error) => toast.error(humanError(error)),
    })
  }

  const hint = rutHint(values.rut)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? 'bottom' : 'right'}
        width={440}
        title="Nuevo cliente"
        description="Solo hace falta el nombre. Lo demás puedes completarlo después."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} loading={create.isPending}>
              Guardar cliente
            </Button>
          </>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Field label="Nombre" error={touched && nameMissing ? 'Escribe el nombre de la persona o empresa.' : undefined}>
            <Input value={values.name} onChange={set('name')} autoFocus placeholder="Pedro Soto o Constructora Andes" autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teléfono" optional>
              <Input value={values.phone} onChange={set('phone')} type="tel" placeholder="+56 9 1234 5678" autoComplete="off" />
            </Field>
            <Field label="Correo" optional>
              <Input value={values.email} onChange={set('email')} type="email" placeholder="pedro@correo.cl" autoComplete="off" />
            </Field>
          </div>
          <Field label="RUT" optional hint={hint ? <span className="text-warn-800">{hint}</span> : 'Para facturas y cotizaciones a empresas.'}>
            <Input
              value={values.rut}
              onChange={set('rut')}
              onBlur={() => setValues((v) => ({ ...v, rut: formatRut(v.rut) }))}
              placeholder="12.345.678-5"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Field label="Dirección" optional>
              <Input value={values.address} onChange={set('address')} placeholder="Los Aromos 1234" autoComplete="off" />
            </Field>
            <Field label="Ciudad" optional>
              <Input value={values.city} onChange={set('city')} placeholder="Concepción" autoComplete="off" />
            </Field>
          </div>
          <Field label="Notas" optional>
            <Textarea value={values.notes} onChange={set('notes')} rows={2} placeholder="Cómo llegó, qué le interesa, horario para llamar…" />
          </Field>
          <button type="submit" hidden />
        </form>
      </SheetContent>
    </Sheet>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { humanError } from '../../lib/api'
import { useCreateClient } from '../../lib/hooks'
import { useT } from '../../lib/i18n'
import { Button, Field, Input, Sheet, SheetContent, Textarea, toast } from '../../ui'
import es from './i18n/es'
import { useTaxIdRules } from './taxId'
import { useIsPhone } from './useIsPhone'

const EMPTY = { name: '', phone: '', email: '', rut: '', address: '', city: '', notes: '' }

/** Cliente nuevo: solo el nombre hace falta; lo demás se completa cuando quieras. */
export function NewClientSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(es)
  const tax = useTaxIdRules()
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
      Object.entries({ ...values, rut: values.rut ? tax.normalize(values.rut) : '' }).filter(([, v]) => v.trim() !== ''),
    ) as typeof values
    create.mutate(body, {
      onSuccess: (client) => {
        onOpenChange(false)
        toast.success(t('sheet.added', { name: client.name }))
        navigate(`/clientes/${client.id}`)
      },
      onError: (error) => toast.error(humanError(error)),
    })
  }

  const hint = tax.hint(values.rut)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={phone ? 'bottom' : 'right'}
        width={440}
        title={t('sheet.title')}
        description={t('sheet.description')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('sheet.cancel')}
            </Button>
            <Button variant="primary" onClick={submit} loading={create.isPending} shortcut={phone ? undefined : 'mod+enter'}>
              {t('sheet.save')}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              submit()
            }
          }}
        >
          <Field label={t('fields.name')} error={touched && nameMissing ? t('sheet.nameRequired') : undefined}>
            <Input value={values.name} onChange={set('name')} autoFocus placeholder={t('placeholders.name')} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fields.phone')} optional>
              <Input value={values.phone} onChange={set('phone')} type="tel" placeholder={t('placeholders.phone')} autoComplete="off" />
            </Field>
            <Field label={t('fields.email')} optional>
              <Input value={values.email} onChange={set('email')} type="email" placeholder={t('placeholders.email')} autoComplete="off" />
            </Field>
          </div>
          <Field label={tax.label} optional hint={hint ? <span className="text-warning">{hint}</span> : t('rut.hint')}>
            <Input
              value={values.rut}
              onChange={set('rut')}
              onBlur={() => setValues((v) => ({ ...v, rut: tax.normalize(v.rut) }))}
              placeholder={tax.placeholder}
              className={tax.chile ? 'code-id' : undefined}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Field label={t('fields.address')} optional>
              <Input value={values.address} onChange={set('address')} placeholder={t('placeholders.address')} autoComplete="off" />
            </Field>
            <Field label={t('fields.city')} optional>
              <Input value={values.city} onChange={set('city')} placeholder={t('placeholders.city')} autoComplete="off" />
            </Field>
          </div>
          <Field label={t('fields.notes')} optional>
            <Textarea value={values.notes} onChange={set('notes')} rows={2} placeholder={t('placeholders.notes')} />
          </Field>
          <button type="submit" hidden />
        </form>
      </SheetContent>
    </Sheet>
  )
}

import { THEME_CHOICES, useTheme, type ResolvedTheme, type ThemePreference } from '../../../lib/theme'
import { useT } from '../../../lib/i18n'
import { RadioCards } from '../../../ui'
import { SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'

/** Miniatura real del tema: usa sus mismos tokens, así no puede quedar desfasada de la paleta. */
function ThemeThumb({ theme, className }: { theme: ResolvedTheme; className?: string }) {
  return (
    <div aria-hidden data-theme={theme} className={className}>
      <div className="flex h-28 bg-frame">
        <div data-frame className="flex w-[22%] shrink-0 flex-col gap-1.5 px-2 pt-2.5">
          <span className="h-1 w-3/4 rounded-full bg-fg-muted" />
          <span className="h-1 w-full rounded-full bg-fg-faint opacity-60" />
          <span className="h-1 w-full rounded-full bg-fg-faint opacity-60" />
          <span className="h-1 w-2/3 rounded-full bg-fg-faint opacity-60" />
        </div>
        <div className="min-w-0 flex-1 py-1.5 pr-1.5">
          <div className="flex h-full flex-col gap-2 rounded-[6px] bg-canvas p-2 shadow-raised">
            <div className="flex items-center justify-between">
              <span className="h-1.5 w-2/5 rounded-full bg-fg-strong" />
              <span className="h-3 w-7 rounded-[3px] bg-signal" />
            </div>
            <div className="flex flex-1 flex-col justify-around rounded-[4px] bg-plate px-1.5 shadow-plate">
              <span className="h-1 w-full rounded-full bg-divider-strong" />
              <span className="h-1 w-5/6 rounded-full bg-divider-strong" />
              <span className="h-1 w-full rounded-full bg-divider-strong" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemThumb() {
  return (
    <div aria-hidden className="grid h-28 grid-cols-2">
      <ThemeThumb theme="light" className="overflow-hidden" />
      <ThemeThumb theme="dark" className="overflow-hidden" />
    </div>
  )
}

/** Tema de la interfaz. Es de cada persona y de cada navegador, no de la empresa. */
export function AppearanceSection() {
  const t = useT(es)
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <SectionHeader title={t('look.title')} description={t('look.description')} />
      <RadioCards<ThemePreference>
        aria-label={t('look.aria')}
        columns={4}
        value={theme}
        onValueChange={setTheme}
        options={THEME_CHOICES.map((value) => ({
          value,
          title: t(`look.${value}`),
          media: value === 'system' ? <SystemThumb /> : <ThemeThumb theme={value} />,
        }))}
      />
    </div>
  )
}

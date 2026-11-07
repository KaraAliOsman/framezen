import { TRIAL_DAYS } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { ButtonLink, Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'

export function Closing() {
  const t = useT(es)
  return (
    <Section labelledBy="closing-title">
      <Container>
        <Reveal className="max-w-3xl">
          <SectionTitle id="closing-title">{t('closing.title')}</SectionTitle>
          <Lead className="mt-5">{t('closing.lead')}</Lead>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink to="/crear-cuenta" variant="primary" size="lg" arrow>
              {t('hero.cta', { days: TRIAL_DAYS })}
            </ButtonLink>
            <p className="text-table text-fg-muted">{t('hero.note')}</p>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

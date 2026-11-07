/**
 * Correos de DEKOPEN en el idioma de quien los recibe (7 idiomas). Cada plantilla devuelve
 * asunto, texto plano y HTML escapado (lib/mail `simpleHtml`). El español es el texto fuente.
 *
 * Idioma del destinatario (lo decide quien envía):
 * - recuperar contraseña: user.locale ?? navegador de quien lo pide ?? 'es'
 * - invitación al equipo: idioma de la empresa (org.locale)
 * - cotización al cliente: idioma del documento (cotización › empresa)
 * - avisos del portal al equipo: user.locale de quien creó la cotización ?? org.locale
 */
import type { Role } from '@dekopen/shared'
import type { MailMessage } from '../../lib/mail'
import { simpleHtml } from '../../lib/mail'
import { DEFAULT_LOCALE, isLocale, type ServerLocale } from '../../lib/i18n/locale'

export type MailContent = Pick<MailMessage, 'subject' | 'text' | 'html'>

type Dict<T> = Record<ServerLocale, T>

/** Idioma seguro para un correo (desconocido → español). */
export function mailLocale(...candidates: (string | null | undefined)[]): ServerLocale {
  for (const c of candidates) if (isLocale(c)) return c
  return DEFAULT_LOCALE
}

const HTML_LANG: Dict<string> = { es: 'es-CL', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', tr: 'tr-TR' }

const FALLBACK_LINK: Dict<string> = {
  es: 'Si el botón no funciona, copia este enlace:',
  en: 'If the button does not work, copy this link:',
  pt: 'Se o botão não funcionar, copie este link:',
  fr: 'Si le bouton ne fonctionne pas, copiez ce lien :',
  de: 'Falls der Button nicht funktioniert, kopieren Sie diesen Link:',
  it: 'Se il pulsante non funziona, copia questo link:',
  tr: 'Düğme çalışmazsa bu bağlantıyı kopyalayın:',
}

function html(locale: ServerLocale, paragraphs: string[], action?: { label: string; url: string }): string {
  return simpleHtml(paragraphs, action, { fallbackText: FALLBACK_LINK[locale], lang: HTML_LANG[locale] })
}

// ── Recuperar contraseña ─────────────────────────────────────────────────────

const RESET: Dict<{ subject: string; hello: (name: string) => string; body: string; button: string; ignore: string }> = {
  es: {
    subject: 'Crea una contraseña nueva para DEKOPEN',
    hello: (n) => `Hola, ${n}:`,
    body: 'Recibimos una solicitud para cambiar la contraseña de tu cuenta en DEKOPEN. Usa este enlace para crear una nueva (vale por una hora):',
    button: 'Crear contraseña nueva',
    ignore: 'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
  },
  en: {
    subject: 'Create a new password for DEKOPEN',
    hello: (n) => `Hi ${n},`,
    body: 'We received a request to change the password of your DEKOPEN account. Use this link to create a new one (valid for one hour):',
    button: 'Create new password',
    ignore: 'If this wasn’t you, ignore this email: your password stays the same.',
  },
  pt: {
    subject: 'Crie uma nova senha para o DEKOPEN',
    hello: (n) => `Olá, ${n}!`,
    body: 'Recebemos uma solicitação para alterar a senha da sua conta no DEKOPEN. Use este link para criar uma nova (válido por uma hora):',
    button: 'Criar nova senha',
    ignore: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
  },
  fr: {
    subject: 'Créez un nouveau mot de passe pour DEKOPEN',
    hello: (n) => `Bonjour ${n},`,
    body: 'Nous avons reçu une demande de modification du mot de passe de votre compte DEKOPEN. Utilisez ce lien pour en créer un nouveau (valable une heure) :',
    button: 'Créer un nouveau mot de passe',
    ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
  },
  de: {
    subject: 'Neues Passwort für DEKOPEN erstellen',
    hello: (n) => `Hallo ${n},`,
    body: 'Wir haben eine Anfrage erhalten, das Passwort Ihres DEKOPEN-Kontos zu ändern. Über diesen Link erstellen Sie ein neues (eine Stunde gültig):',
    button: 'Neues Passwort erstellen',
    ignore: 'Falls Sie das nicht waren, ignorieren Sie diese E-Mail: Ihr Passwort bleibt unverändert.',
  },
  it: {
    subject: 'Crea una nuova password per DEKOPEN',
    hello: (n) => `Ciao ${n},`,
    body: 'Abbiamo ricevuto una richiesta di modifica della password del tuo account DEKOPEN. Usa questo link per crearne una nuova (valido un’ora):',
    button: 'Crea nuova password',
    ignore: 'Se non sei stato tu, ignora questa email: la tua password resta invariata.',
  },
  tr: {
    subject: 'DEKOPEN için yeni şifre oluşturun',
    hello: (n) => `Merhaba ${n},`,
    body: 'DEKOPEN hesabınızın şifresini değiştirme talebi aldık. Yeni bir şifre oluşturmak için bu bağlantıyı kullanın (bir saat geçerlidir):',
    button: 'Yeni şifre oluştur',
    ignore: 'Bu talebi siz yapmadıysanız bu e-postayı yok sayın: şifreniz değişmeden kalır.',
  },
}

export function passwordResetMail(locale: ServerLocale, params: { firstName: string; url: string }): MailContent {
  const t = RESET[locale]
  const lines = [t.hello(params.firstName), t.body]
  return {
    subject: t.subject,
    text: `${lines.join('\n\n')}\n\n${params.url}\n\n${t.ignore}`,
    html: html(locale, [...lines, t.ignore], { label: t.button, url: params.url }),
  }
}

// ── Invitación al equipo ─────────────────────────────────────────────────────

const ROLE_NAMES: Dict<Record<Role, string>> = {
  es: { owner: 'dueño', estimator: 'cotizador', workshop: 'jefe de taller', operator: 'operario', installer: 'instalador' },
  en: { owner: 'owner', estimator: 'estimator', workshop: 'workshop manager', operator: 'operator', installer: 'installer' },
  pt: { owner: 'proprietário', estimator: 'orçamentista', workshop: 'chefe de oficina', operator: 'operador', installer: 'instalador' },
  fr: { owner: 'propriétaire', estimator: 'deviseur', workshop: 'chef d’atelier', operator: 'opérateur', installer: 'poseur' },
  de: { owner: 'Inhaber', estimator: 'Kalkulator', workshop: 'Werkstattleiter', operator: 'Mitarbeiter in der Fertigung', installer: 'Monteur' },
  it: { owner: 'titolare', estimator: 'preventivista', workshop: 'capo officina', operator: 'operatore', installer: 'installatore' },
  tr: { owner: 'sahip', estimator: 'teklif uzmanı', workshop: 'atölye şefi', operator: 'operatör', installer: 'montajcı' },
}

const INVITE: Dict<{ subject: (who: string, org: string) => string; body: (who: string, org: string, role: string) => string; open: string; button: string }> = {
  es: {
    subject: (w, o) => `${w} te invitó a ${o} en DEKOPEN`,
    body: (w, o, r) => `${w} te invitó a sumarte a ${o} en DEKOPEN como ${r}.`,
    open: 'Abre este enlace para entrar (vale por 7 días):',
    button: 'Aceptar invitación',
  },
  en: {
    subject: (w, o) => `${w} invited you to ${o} on DEKOPEN`,
    body: (w, o, r) => `${w} invited you to join ${o} on DEKOPEN as ${r}.`,
    open: 'Open this link to join (valid for 7 days):',
    button: 'Accept invitation',
  },
  pt: {
    subject: (w, o) => `${w} convidou você para ${o} no DEKOPEN`,
    body: (w, o, r) => `${w} convidou você para participar de ${o} no DEKOPEN como ${r}.`,
    open: 'Abra este link para entrar (válido por 7 dias):',
    button: 'Aceitar convite',
  },
  fr: {
    subject: (w, o) => `${w} vous invite à rejoindre ${o} sur DEKOPEN`,
    body: (w, o, r) => `${w} vous invite à rejoindre ${o} sur DEKOPEN en tant que ${r}.`,
    open: 'Ouvrez ce lien pour rejoindre l’équipe (valable 7 jours) :',
    button: 'Accepter l’invitation',
  },
  de: {
    subject: (w, o) => `${w} hat Sie zu ${o} auf DEKOPEN eingeladen`,
    body: (w, o, r) => `${w} hat Sie eingeladen, ${o} auf DEKOPEN als ${r} beizutreten.`,
    open: 'Öffnen Sie diesen Link, um beizutreten (7 Tage gültig):',
    button: 'Einladung annehmen',
  },
  it: {
    subject: (w, o) => `${w} ti ha invitato in ${o} su DEKOPEN`,
    body: (w, o, r) => `${w} ti ha invitato a unirti a ${o} su DEKOPEN come ${r}.`,
    open: 'Apri questo link per entrare (valido 7 giorni):',
    button: 'Accetta invito',
  },
  tr: {
    subject: (w, o) => `${w} sizi DEKOPEN’de ${o} ekibine davet etti`,
    body: (w, o, r) => `${w} sizi DEKOPEN’de ${o} ekibine ${r} olarak katılmaya davet etti.`,
    open: 'Katılmak için bu bağlantıyı açın (7 gün geçerlidir):',
    button: 'Daveti kabul et',
  },
}

const GREETING: Dict<string> = { es: 'Hola:', en: 'Hello,', pt: 'Olá!', fr: 'Bonjour,', de: 'Hallo,', it: 'Ciao,', tr: 'Merhaba,' }

export function invitationMail(locale: ServerLocale, params: { inviterName: string; orgName: string; role: Role; link: string }): MailContent {
  const t = INVITE[locale]
  const role = ROLE_NAMES[locale][params.role] ?? params.role
  const intro = t.body(params.inviterName, params.orgName, role)
  return {
    subject: t.subject(params.inviterName, params.orgName),
    text: `${GREETING[locale]}\n\n${intro}\n\n${t.open}\n${params.link}`,
    html: html(locale, [GREETING[locale], intro, t.open], { label: t.button, url: params.link }),
  }
}

// ── Cotización enviada al cliente ────────────────────────────────────────────

const QUOTE_SENT: Dict<{ subject: (n: number, org: string) => string; intro: (client: string | undefined, n: number, title: string | undefined, online: boolean) => string; button: string }> = {
  es: {
    subject: (n, o) => `Cotización N° ${n} · ${o}`,
    intro: (c, n, t, online) => `Hola${c ? `, ${c}` : ''}: te enviamos la cotización N° ${n}${t ? ` (${t})` : ''}. ${online ? 'Puedes revisarla, ver cada ventana y aceptarla en línea.' : 'Va adjunta en PDF.'}`,
    button: 'Ver cotización',
  },
  en: {
    subject: (n, o) => `Quote No. ${n} · ${o}`,
    intro: (c, n, t, online) => `Hi${c ? ` ${c}` : ''}, here is quote No. ${n}${t ? ` (${t})` : ''}. ${online ? 'You can review it, see every window and accept it online.' : 'It’s attached as a PDF.'}`,
    button: 'View quote',
  },
  pt: {
    subject: (n, o) => `Orçamento nº ${n} · ${o}`,
    intro: (c, n, t, online) => `Olá${c ? `, ${c}` : ''}! Enviamos o orçamento nº ${n}${t ? ` (${t})` : ''}. ${online ? 'Você pode revisá-lo, ver cada janela e aceitá-lo on-line.' : 'Segue em PDF anexo.'}`,
    button: 'Ver orçamento',
  },
  fr: {
    subject: (n, o) => `Devis n° ${n} · ${o}`,
    intro: (c, n, t, online) => `Bonjour${c ? ` ${c}` : ''}, voici le devis n° ${n}${t ? ` (${t})` : ''}. ${online ? 'Vous pouvez le consulter, voir chaque fenêtre et l’accepter en ligne.' : 'Il est joint en PDF.'}`,
    button: 'Voir le devis',
  },
  de: {
    subject: (n, o) => `Angebot Nr. ${n} · ${o}`,
    intro: (c, n, t, online) => `Hallo${c ? ` ${c}` : ''}, anbei das Angebot Nr. ${n}${t ? ` (${t})` : ''}. ${online ? 'Sie können es prüfen, jedes Fenster ansehen und online annehmen.' : 'Es ist als PDF angehängt.'}`,
    button: 'Angebot ansehen',
  },
  it: {
    subject: (n, o) => `Preventivo n. ${n} · ${o}`,
    intro: (c, n, t, online) => `Ciao${c ? ` ${c}` : ''}, ti inviamo il preventivo n. ${n}${t ? ` (${t})` : ''}. ${online ? 'Puoi controllarlo, vedere ogni finestra e accettarlo online.' : 'Lo trovi allegato in PDF.'}`,
    button: 'Vedi preventivo',
  },
  tr: {
    subject: (n, o) => `Teklif No. ${n} · ${o}`,
    intro: (c, n, t, online) => `Merhaba${c ? ` ${c}` : ''}, ${n} numaralı teklifinizi gönderiyoruz${t ? ` (${t})` : ''}. ${online ? 'İnceleyebilir, her pencereyi görebilir ve çevrimiçi onaylayabilirsiniz.' : 'PDF olarak ektedir.'}`,
    button: 'Teklifi görüntüle',
  },
}

/**
 * Cotización al cliente. `message` = texto propio de quien envía (va tal cual, en su idioma);
 * sin mensaje, el saludo de la plantilla.
 */
export function quoteSentMail(
  locale: ServerLocale,
  /** Sin `url` es un envío solo PDF: el correo no ofrece enlace. */
  params: { number: number; title?: string; clientFirstName?: string; orgName: string; url?: string; message?: string },
): MailContent {
  const t = QUOTE_SENT[locale]
  const written = params.message?.trim()
  const intro = written || t.intro(params.clientFirstName, params.number, params.title || undefined, !!params.url)
  // El mensaje del diálogo ya viene firmado y con el enlace en su lugar: no se repite.
  const tail = [params.url && !intro.includes(params.url) ? params.url : '', written ? '' : params.orgName].filter(Boolean)
  return {
    subject: t.subject(params.number, params.orgName),
    text: [intro, ...tail].join('\n\n'),
    html: html(locale, intro.split(/\n{2,}/), params.url ? { label: t.button, url: params.url } : undefined),
  }
}

// ── Avisos del portal al equipo ──────────────────────────────────────────────

const PORTAL: Dict<{
  acceptedSubject: (who: string, n: number) => string
  accepted: (who: string, n: number, version?: string) => string
  next: string
  changesSubject: (who: string, n: number) => string
  changes: (who: string, message: string) => string
  button: string
}> = {
  es: {
    acceptedSubject: (w, n) => `¡${w} aceptó la cotización N° ${n}!`,
    accepted: (w, n, v) => `${w} aceptó la cotización N° ${n}${v ? ` (versión ${v})` : ''}.`,
    next: 'Ya puedes pasarla a taller.',
    changesSubject: (w, n) => `${w} pidió cambios en la cotización N° ${n}`,
    changes: (w, m) => `${w} escribió: «${m}»`,
    button: 'Abrir cotización',
  },
  en: {
    acceptedSubject: (w, n) => `${w} accepted quote No. ${n}!`,
    accepted: (w, n, v) => `${w} accepted quote No. ${n}${v ? ` (version ${v})` : ''}.`,
    next: 'You can now send it to the workshop.',
    changesSubject: (w, n) => `${w} requested changes to quote No. ${n}`,
    changes: (w, m) => `${w} wrote: “${m}”`,
    button: 'Open quote',
  },
  pt: {
    acceptedSubject: (w, n) => `${w} aceitou o orçamento nº ${n}!`,
    accepted: (w, n, v) => `${w} aceitou o orçamento nº ${n}${v ? ` (versão ${v})` : ''}.`,
    next: 'Você já pode enviá-lo para a oficina.',
    changesSubject: (w, n) => `${w} pediu alterações no orçamento nº ${n}`,
    changes: (w, m) => `${w} escreveu: “${m}”`,
    button: 'Abrir orçamento',
  },
  fr: {
    acceptedSubject: (w, n) => `${w} a accepté le devis n° ${n} !`,
    accepted: (w, n, v) => `${w} a accepté le devis n° ${n}${v ? ` (version ${v})` : ''}.`,
    next: 'Vous pouvez maintenant l’envoyer à l’atelier.',
    changesSubject: (w, n) => `${w} a demandé des modifications du devis n° ${n}`,
    changes: (w, m) => `${w} a écrit : « ${m} »`,
    button: 'Ouvrir le devis',
  },
  de: {
    acceptedSubject: (w, n) => `${w} hat Angebot Nr. ${n} angenommen!`,
    accepted: (w, n, v) => `${w} hat Angebot Nr. ${n}${v ? ` (Version ${v})` : ''} angenommen.`,
    next: 'Sie können es jetzt an die Werkstatt übergeben.',
    changesSubject: (w, n) => `${w} wünscht Änderungen an Angebot Nr. ${n}`,
    changes: (w, m) => `${w} schrieb: „${m}“`,
    button: 'Angebot öffnen',
  },
  it: {
    acceptedSubject: (w, n) => `${w} ha accettato il preventivo n. ${n}!`,
    accepted: (w, n, v) => `${w} ha accettato il preventivo n. ${n}${v ? ` (versione ${v})` : ''}.`,
    next: 'Ora puoi passarlo all’officina.',
    changesSubject: (w, n) => `${w} ha chiesto modifiche al preventivo n. ${n}`,
    changes: (w, m) => `${w} ha scritto: «${m}»`,
    button: 'Apri preventivo',
  },
  tr: {
    acceptedSubject: (w, n) => `${w}, ${n} numaralı teklifi onayladı!`,
    accepted: (w, n, v) => `${w}, ${n} numaralı teklifi onayladı${v ? ` (sürüm ${v})` : ''}.`,
    next: 'Artık atölyeye gönderebilirsiniz.',
    changesSubject: (w, n) => `${w}, ${n} numaralı teklifte değişiklik istedi`,
    changes: (w, m) => `${w} şunu yazdı: “${m}”`,
    button: 'Teklifi aç',
  },
}

export function quoteAcceptedMail(locale: ServerLocale, params: { who: string; number: number; version?: string; url: string }): MailContent {
  const t = PORTAL[locale]
  const text = `${t.accepted(params.who, params.number, params.version)} ${t.next}`
  return { subject: t.acceptedSubject(params.who, params.number), text: `${text}\n\n${params.url}`, html: html(locale, [text], { label: t.button, url: params.url }) }
}

export function quoteChangesMail(locale: ServerLocale, params: { who: string; number: number; message: string; url: string }): MailContent {
  const t = PORTAL[locale]
  const text = t.changes(params.who, params.message)
  return { subject: t.changesSubject(params.who, params.number), text: `${text}\n\n${params.url}`, html: html(locale, [text], { label: t.button, url: params.url }) }
}

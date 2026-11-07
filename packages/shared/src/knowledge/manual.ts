/**
 * Manual de DEKOPEN y conocimiento del oficio para el asistente (lo lee el MODELO).
 *
 * Está en inglés a propósito: es contexto para el modelo, que responde siempre en el idioma de la
 * persona. Lo que se muestra en pantalla (título y resumen de cada tema) vive en `i18n/` en los 7
 * idiomas. Sin cifras de negocio: los precios los calcula siempre el motor con el catálogo real.
 */
import type { KnowledgeTopicId } from './topics'

export interface KnowledgeEntry {
  /** Palabras clave multilingües (sin tildes, en minúsculas) para la búsqueda local. */
  keywords: readonly string[]
  /** Texto para el modelo (inglés, Markdown liviano). */
  body: string
}

export const KNOWLEDGE_MANUAL: Record<KnowledgeTopicId, KnowledgeEntry> = {
  getting_started: {
    keywords: ['start', 'inicio', 'empezar', 'onboarding', 'primeros pasos', 'how', 'como', 'dashboard', 'home'],
    body: `DEKOPEN is a quoting, design and production app for PVC (and aluminium) window and door manufacturers.
Main screens: Home (/inicio: KPIs, quotes needing follow-up, recent quotes), Quotes (/cotizaciones), Clients (/clientes), Workshop (/taller: work orders), Catalogue (/catalogo: lines, colours, glass, hardware, prices), Documents (/documentos: quote and catalogue templates), Settings (/ajustes: company, pricing, team, plan, languages, assistants).
Typical flow: create a quote → add windows (typology, size, line, colour, glass) → prices update live from the engine → choose a document template → deliver it to the client as PDF (the default) or as a web link → the client accepts in the portal → send to the workshop (work order) → cut lists, glass, materials, labels.
Principles: nothing blocks, everything autosaves, actions can be undone, warnings are inline, the engine is the only source of numbers.`,
  },
  quotes: {
    keywords: ['quote', 'cotizacion', 'presupuesto', 'orcamento', 'devis', 'angebot', 'preventivo', 'teklif', 'status', 'estado', 'enviar', 'send', 'revision'],
    body: `A quote has a number (N° 412), a project title, an optional client, windows (items with refs V1, V2…), extras, a discount %, internal notes, a validity date and document settings.
Statuses: draft → sent → accepted / rejected → workshop → installed → closed. Sending creates a frozen revision (A, B, C…) and a public portal link; editing after sending and resending creates the next revision. "Sold" figures use what the client saw and accepted, never the live draft.
Two ways to deliver: PDF, the default because it is the custom of the trade, and web, a link to the client portal where the client can also download the document; a company can also send both. Each company sets its default and its message templates per channel and language in Settings. It goes by email (from DEKOPEN with the company name) or WhatsApp, or the user copies the link. The message to the client never carries the total. Sending is an external action: it always needs explicit confirmation.
Quotes can be duplicated, moved to the trash and restored. Totals: net, tax (IVA 19 % by default in Chile, configurable label/rate), total; discounts apply to the whole quote.`,
  },
  quote_editor: {
    keywords: ['editor', 'items', 'ventanas', 'inspector', 'precio', 'price', 'total', 'undo', 'deshacer', 'autosave'],
    body: `The quote editor shows the list of windows with drawings, an inspector for the selected window and live totals.
Each item: ref (V1…), quantity, room/location, optional name, design (typology tree, size, line, colours, glass, accessories), notes, optional manual unit price.
Edits autosave with optimistic versions; if someone else changed the quote, the editor shows the latest version (nothing is lost). Assistant changes appear as one undo step ("Changes by <assistant>").
Price breakdown ("Where does the price come from?") comes from the engine: materials per family (profiles, reinforcement, glass, hardware, accessories), waste, labour per m², installation, direct cost, margin or markup, rounding. Users without cost permission only see sale prices.`,
  },
  typologies: {
    keywords: ['typology', 'tipologia', 'tipo', 'ventana', 'puerta', 'corredera', 'sliding', 'casement', 'abatible', 'oscilobatiente', 'door', 'folding', 'plegable'],
    body: `Use exactly the typology ids of the tool enums. The full list by group is appended below.
Each typology picks a line of the matching kind (casement, sliding, door…). Default sizes exist per typology; the engine warns (never blocks) when a leaf or element is out of typical limits.
Windows joined as one unit are assemblies, not typologies: coupled side by side or stacked, door with window and transom, corner at 90° or a variable angle, bay window and bow window (add_assembly; width and height are per unit, a bay's centre pane is twice as wide). Each joint has an angle and a direction: it can go out of the wall or into the room, and a corner can turn left or right (edit_assembly changes them on an existing one; an angle over 180 is the same post turned the other way, so 210 is 150 inward). A line has the joint only if its catalogue has the coupling profile or post for that angle. Without it the assembly is still drawn and quoted, and the joint stays out of the total with a warning: nothing replaces the missing data. Each unit is priced with its own line, colour and glass, plus the joints. Windows already in a quote can also be joined into one item (join_windows), if they have the same quantity.
Other combinations: casement or tilt-turn with a lower pane or a transom, awning over a fixed pane, fixed with a hopper above, double casement with mullion, solid doors, doors with kick panel, outward-opening doors, single and double hung (guillotina) and fixed louvers.
Naming hints: sliding_2_fixed = one moving + one fixed leaf; sliding_mono = single-rail; sliding_3_rail = 3 leaves on 3 rails; lift_slide_* = lift and slide (HST); tilt_slide* = tilt-slide (PSK); folding_N = bifold with N leaves; french_* = double leaf without mullion (active + passive leaf); balcony_door* and entrance_door* are floor-reaching door leaves; *_sidelights = fixed side panes; *_transom = fixed light above.`,
  },
  openings: {
    keywords: ['opening', 'apertura', 'abatible', 'oscilobatiente', 'proyectante', 'oscilante', 'pivotante', 'osciloparalela', 'hinge', 'bisagra', 'manilla', 'handle'],
    body: `Opening kinds per pane: fixed; casement (side-hung, inward by default); tilt_turn (turn + tilt inward; sequence turn_first or tilt_first); tilt (bottom-hung inward, "oscilante"/hopper); awning (top-hung outward, "proyectante"); door; pivot_v / pivot_h (pivot axis 0–1); tilt_slide (PSK, slides sideways after tilting); parallel_slide; folding (bifold leaves).
Hinge side is always described seen from the inside. The handle goes on the opposite side of the hinges. Direction in/out applies to casements and doors.
French double leaf (joint "french"): one active leaf with handle, one passive leaf with flush bolts; choose the passive side.
Sliding windows have no hinges: they slide on rails; lift_slide (HST) lifts the leaf to slide; standard sliding uses interlocks.
Folding: leaves grouped by stacking side; odd groups use the jamb leaf as the passage leaf.`,
  },
  shapes: {
    keywords: ['shape', 'forma', 'arco', 'arch', 'medio punto', 'redonda', 'round', 'ovalada', 'oval', 'pentagono', 'octogono', 'dos aguas', 'gable', 'trapecio'],
    body: `Shapes: rect, arch (semicircular "medio punto" or segmental "arco rebajado"), trapezoid, triangle, round, oval, pentagon, octagon, gable.
Curved frame pieces longer than the bar length minus grip are split into equal pieces. Glass in shaped panes is charged by its bounding rectangle; the real area is reported separately.
Opening sashes are allowed in the rectangular part (e.g. arch_casement); panes crossing the curved or sloped part stay fixed (the engine warns otherwise).`,
  },
  accessories: {
    keywords: ['accessory', 'accesorio', 'persiana', 'roller shutter', 'mosquitero', 'insect screen', 'alfeizar', 'botaguas', 'sill', 'umbral', 'threshold'],
    body: `Accessories per window (priced through catalogue accessory rules):
- Roller shutter: type monoblock (box on the frame), exterior box, or integrated; operation strap, crank or motor.
- Insect screen: fixed, hinged, sliding, roller or pleated.
- Sill ("alféizar", also called "botaguas"): exterior sill across the width.
- Threshold: low threshold for doors instead of a full frame.
If the catalogue has no rule for an accessory, the engine warns (extra_rules_missing) and the price excludes it.`,
  },
  colors_textures: {
    keywords: ['color', 'colour', 'foil', 'foliado', 'textura', 'texture', 'madera', 'wood', 'roble', 'nogal', 'antracita', 'bicolor', 'veta', 'grain'],
    body: `Colours come from the catalogue (white, foils such as golden oak, walnut, anthracite 7016 smooth or woodgrain, etc.). Windows can be bicolour: exterior colour + interior colour.
Built-in foil textures render realistic wood grain and finishes in drawings, documents and the portal. Users on Pro and above can upload their own texture photos (Catalogue → Colours & textures); the server cleans the photo, makes it seamless, detects the grain direction and stores a tile. Own colours (name, flat hex fallback, texture, price factor over white or own prices) can then be assigned to lines.
A colour not offered by the line still works but the engine warns that its price may be missing.`,
  },
  glass: {
    keywords: ['glass', 'vidrio', 'termopanel', 'dvh', 'doble vidriado', 'igu', 'laminado', 'laminated', 'templado', 'tempered', 'low-e', 'baja emisividad', 'simple'],
    body: `Glass types: mono (single pane, e.g. 4 mm float), DVH / insulated glass unit ("termopanel", e.g. 4+12+4 = 4 mm glass, 12 mm cavity, 4 mm glass), laminated (safety, e.g. 3+3 with PVB), tempered, low-e coated units, obscured/satin.
"Termopanel" in Chile means DVH. The default is usually DVH 4+12+4 clear. Glass is priced per m² with a minimum billable area per glass.
Safety glass (laminated or tempered) is recommended for doors, low panes and large panes. Low-e and warm-edge spacers improve thermal performance.`,
  },
  catalog_prices: {
    keywords: ['catalog', 'catalogo', 'linea', 'line', 'serie', 'perfil', 'profile', 'precio', 'price', 'mis precios', 'csv', 'pauta', 'brand', 'marca'],
    body: `The catalogue holds brands and their lines (profile systems), profiles with bar prices per colour, reinforcement, hardware items and rules, accessories, colours and glass. Organisations enable brands and lines.
Own purchase prices ("Mis precios") override list prices; they can be edited in the catalogue or imported from CSV. Cut deductions ("pauta") can be adjusted per line.
Readiness: a line is "ready to quote" when the profiles, colours, glass and hardware it needs have prices; the catalogue shows what is missing. A window that lacks a piece or price is drawn with a warning and stays out of the total until the data exists or it gets a manual price: it is never quoted at $0 nor estimated. In an assembly only the affected units and joints stay out. Changing prices reprices draft quotes; sent revisions keep their figures.
Only owners/managers change prices. Purchase prices and discounts are hidden from roles without cost permission.`,
  },
  documents_templates: {
    keywords: ['document', 'documento', 'pdf', 'template', 'plantilla', 'propuesta', 'diseno', 'preset', 'catalogo pdf', 'portada', 'cover'],
    body: `Quotes and catalogues print through templates. There are 5 quote presets (Atelier, Corporativa, Obra, Hogar, Memoria) and 4 catalogue presets (Habitar, Sistema, Colección Modular, Materia y Color).
A template is structured JSON (never HTML): theme (palette with contrast checks, font pair from a closed list, density, radius, drawing style), page (A4/Letter, margins, header/footer, page numbers) and ordered sections (cover, letter, client strip, project summary, items, comparison, technical specs, finishes board, totals, payment, terms, warranty, about us, gallery, acceptance/signature with QR, custom text with whitelisted placeholders…).
The total prints once, in the closing: never on the cover, header, index or intro, and no template or edit can bring it forward. Conditions, warranty, payment and acceptance go after the total by default; each company can change that order, always keeping the total in the closing.
Users duplicate a preset and edit it in the template editor, or ask the assistant to design one (Pro and above: "custom templates"). Each quote can override texts, sections, item notes, language and template without touching the org template. Money always comes from the engine.`,
  },
  document_ops: {
    keywords: ['docop', 'document ops', 'operaciones', 'edit template', 'editar plantilla', 'sections', 'secciones'],
    body: `Templates and per-quote documents are edited with DocOps (JSON objects with an "op" field), applied atomically and validated on the server.
Template ops: rename, setDescription, setTheme {patch}, setColor {role, value #RRGGBB}, setFontPair {pairId | heading/body/mono}, setDrawingStyle {style, sectionId?}, setPage {patch}, addSection {section:{type, title?, options?}, afterId|beforeId|position}, removeSection {sectionId}, moveSection {sectionId, afterId|beforeId|position|toIndex}, updateSectionOptions {sectionId, options}, updateSection {sectionId, patch:{enabled?, title?, tone?, pageBreak?}}, toggleSection {sectionId, enabled?}, duplicateSection {sectionId}, setSectionText {sectionId, slot: title|subtitle|content, value}, editRichText, setItemDisplay {patch}, setPriceLevel {level: full|lines|groups|total}, setDocSettings {patch}, resetToPreset {presetId?}.
Per-quote ops additionally: setText {field: intro|conditions|paymentTerms|warranty|leadTimeText|signatureName|footer|clientNote, value}, setTemplate {templateId}, setLocale {locale}, setValidityDays {days}, setItemNote {itemId, note}, resetSection {sectionId}, reset {scope}.
Section options (updateSectionOptions; for the windows of a quote also setItemDisplay {patch}, which applies to every "items" section):
- items: variant table|cards|sheet|gallery|per_page, columns 1|2|3, drawingSize none|xs|s|m|l|xl ("none" removes the window drawing; sheet and per_page then print as a list), drawingDimensions none|total|all, drawingView interior|exterior|both, drawingStyle inherit|realistic|technical, finishes none|combined|inside_outside, groupBy none|room|floor|line, priceTax net|gross and the switches showUnitPrices, showLineTotals, showSpecs (every technical row under a window), showSystem, showGlass, showGlassImage (the glass picture next to its name), showGlassBuildup, showArea, showSwatches, showPerformance, showNotes, showRef, showSize, showQty, showLocation, showOpening, showAccessories, showHardware, showRoughOpening, showColorNote, showOtherLines, showGroupSubtotals, groupPageBreak.
- technical_specs: variant schedule|matrix|glass_layers and showGlassImage (the layered glass picture), showGlassBuildup, showHardware, showSources. To remove the whole technical section use toggleSection {sectionId, enabled:false}.
Document settings (setDocSettings {patch}; null clears a key): docTitle, customTitle, numberPrefix, numberPad, showRevision, letterhead, logoSize, showLogo (logo in the letterhead and page headers), logoAssetId (a library image that replaces the company logo in this document), termsPlacement, brandProfile, brandHardware, brandPlacement, brandSize, lineDetail, customFields.
The final total is printed once, in the closing section, never on the cover or in a header: no option shows it elsewhere, and moveSection refuses an order that puts anything but the closing sections after it.
Always read the template first (get_template) to know section ids. Texts must be plain text (no HTML, URLs, scripts or CSS). Unknown or unsafe ops are rejected with issues you can fix and retry.`,
  },
  client_portal: {
    keywords: ['portal', 'cliente', 'client', 'link', 'enlace', 'aceptar', 'accept', '3d', 'firma', 'signature'],
    body: `Each sent quote has a public portal link (/c/<token>). The portal is the web way of delivering a quote; the PDF remains the default. The client sees the latest sent revision in the document language, realistic drawings, an optional 3D view (Pro and above) and, with it, seeing the window on their wall with the phone camera (AR); each company can turn these off. The client can download the document, accept it (name and optional ID) or request changes.
Payments: DEKOPEN never touches the money. Each company publishes what it wants on the web: bank transfer accounts, instructions, payment links and a deposit (percentage or amount); by default the client sees them only after accepting. Bank accounts and payment keys are set in Settings, out of the assistant's scope; deposits received are recorded on the quote with record_quote_payment. Accepting records the revision and total accepted; the team gets notified.
The portal never shows internal notes, costs or margins. Sharing the link is an external action and needs confirmation.`,
  },
  clients: {
    keywords: ['client', 'cliente', 'customer', 'rut', 'contacto', 'contact', 'telefono', 'email'],
    body: `Clients have name, tax id (RUT in Chile), email, phone, address, city and notes, plus their quotes and the total accepted. Clients can be created from a quote (find-or-create by name), edited, moved to the trash and restored. Search ignores accents and case and matches name, email, phone, city and tax id.`,
  },
  workshop: {
    keywords: ['workshop', 'taller', 'ot', 'orden de trabajo', 'work order', 'produccion', 'cortes', 'cuts', 'etiquetas', 'labels', 'estaciones', 'stations'],
    body: `Accepted quotes go to the workshop as work orders (OT). A work order lists the windows and their station, in this order: cut, weld, assembly (cleaning and frame assembly), hardware, glazing, qc (quality control), ready, installed. Windows move between stations by dragging them on the board or with move_windows_to_station, forward or back, one by one or in bulk, in one work order or across all of them. Workshop documents: work order sheet, cut optimisation per bar, glass list, materials and purchase orders, assembly sheets, costs (owners only), QR labels.
Creating a work order starts production and moves the quote to "workshop": it always needs confirmation. When every window is installed the quote becomes "installed".`,
  },
  settings_languages: {
    keywords: ['settings', 'ajustes', 'configuracion', 'idioma', 'language', 'moneda', 'currency', 'iva', 'tax', 'margen', 'margin', 'defaults', 'predeterminado'],
    body: `Settings: Company (name, tax id, address, logo, brand colour), Pricing (margin or markup %, labour per m², installation per m² or per unit, waste %, rounding, tax %), Workshop (kerf, trims), Documents (default templates, texts: intro, conditions, payment terms, warranty, lead time, validity days), Defaults (line, colour, glass for new windows), Team and roles, Plan and billing, Languages (UI language per user; default document language per company; currency; tax label), Assistants.
Languages: Spanish (Chile, default), English, Portuguese, French, German, Italian, Turkish. The UI language is per person; each quote can have its own document language for PDF, portal and emails. Currency does not change with language.
Only owners/managers change company settings; billing, plan and team roles are never changed by the assistant.`,
  },
  plans_credits: {
    keywords: ['plan', 'plans', 'precio plan', 'credits', 'creditos', 'ia', 'ai', 'taller', 'pro', 'empresa', 'trial', 'prueba', 'limite', 'limit'],
    body: `Plans: Taller (1 user, local assistant commands only, 1 assistant), Pro (3 users, AI assistant with monthly credits, 3 assistants, client 3D view, purchase orders, saw export, custom templates, texture uploads), Empresa (unlimited users, roles, stations, field, branches, 8 assistants, more credits), Empresa 2× (15 assistants, double credits). The 14-day trial has Pro features.
AI credits: credits = ceil((uncached input tokens + 0.02 × cached input + 2 × output) / 1000) per model call. Local commands (recognised without AI) are free. There are daily caps per person and per company. When credits run out, local commands keep working.
Plan changes and payments are done by the owner in Settings → Plan; the assistant never changes plans or billing.`,
  },
  assistant: {
    keywords: ['assistant', 'asistente', 'bot', 'marco', 'modo', 'mode', 'chat', 'supervisado', 'supervised', 'acceso total', 'full access', 'memoria', 'memory', 'historial', 'history', 'comandos', 'commands'],
    body: `Assistants: each organisation can have several assistants (name, avatar, personality, default mode, enabled areas, language, private or shared; count limited by plan).
Modes: Chat = answers and reads only (no business changes). Supervised = every change is proposed as an approval card with the exact arguments and a preview; nothing happens until the user approves. Full access = reversible changes run immediately with undo; sending, sharing links, starting production, deleting and price changes still ask for confirmation.
Local commands: common requests ("add a 1500 x 1200 sliding window", "all in walnut", "discount 5 %", "go to clients") are recognised instantly without AI and cost 0 credits; everything else goes to the AI model.
Memory: users can say "remember that…"; memories have a scope (this assistant, all my assistants, whole company — managers only) and can be viewed, edited, pinned or deleted. History: conversations are saved per person, searchable, renameable, pinnable and resumable. Every assistant action is logged and undoable when reversible.`,
  },
  pvc_basics: {
    keywords: ['pvc', 'perfil', 'profile', 'marco', 'frame', 'hoja', 'sash', 'travesano', 'mullion', 'junquillo', 'bead', 'refuerzo', 'reinforcement', 'herraje', 'hardware', 'instalacion', 'installation', 'medidas', 'limits', 'u-value', 'aislacion'],
    body: `PVC window anatomy: frame (fixed outer profile), sash/leaf (opening part), mullion/transom (fixed divider between panes), French mullion/astragal (on the passive leaf of double leaves), glazing bead (holds the glass), gaskets, steel reinforcement inside profiles, hardware (hinges, espagnolette, handle, locking points), drainage slots.
Fabrication: cut profiles with mitres (cut deductions per line = "pauta"), insert reinforcement, weld corners, clean welds, fit hardware, glaze with beads and setting blocks, check and label.
Typical limits (indicative): casement/tilt-turn leaves up to ~1300 × 2400 mm and ~100–130 kg; sliding leaves wider; HST leaves up to ~3000 × 2700 mm. Very wide assemblies need couplings or statics checks. The engine warns about out-of-range leaves.
Thermal and acoustic performance depend on profile chambers, glazing (DVH, low-e, gas, warm edge) and installation (sealing tapes, insulation, sills). Measurements: width × height in mm of the outer frame; on site, measure the opening at several points and deduct fitting gaps.`,
  },
  trade_terms: {
    keywords: ['termino', 'term', 'glosario', 'glossary', 'traduccion', 'translation', 'chile', 'palabra', 'word', 'jerga', 'slang'],
    body: `Chilean trade terms and equivalents:
termopanel = DVH = insulated glass unit (IGU); proyectante = top-hung outward (awning); oscilante = bottom-hung inward (hopper/tilt); oscilobatiente = tilt and turn; abatible = casement; corredera = sliding; corredera elevadora = lift and slide (HST); osciloparalela = tilt-slide (PSK); plegable = folding/bifold; balconera = balcony door; puerta de acceso = entrance door; paño fijo = fixed pane; banderola/sobreluz = transom light; medio punto = semicircular arch; arco rebajado = segmental arch; marco = frame (not the assistant's name!); hoja = sash/leaf; travesaño = mullion/transom; junquillo = glazing bead; pauta = cut deductions; herrajes = hardware; foliado = foil (laminated colour film); alféizar/botaguas = sill; persiana = roller shutter; mosquitero = insect screen; OT = work order; RUT = Chilean tax id; IVA = VAT (19 %); "lucas" = thousand pesos (money, never a percentage).
Units: sizes in mm, written 1.500 × 1.200 mm in Chile (dot as thousands separator). Treat "60 x 120" as centimetres and "1,5 x 1,2" as metres when obvious, and say so.`,
  },
}

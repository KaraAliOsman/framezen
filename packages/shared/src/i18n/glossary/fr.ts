import type { Translation } from '../translator'
import type es from './es'

/**
 * Glossaire métier · français (vouvoiement). Typographie : espace insécable ( ) avant « : »
 * et à l’intérieur des guillemets « ».
 */
const fr: Translation<typeof es> = {
  typology: {
    fixed: 'Châssis fixe',
    casement: 'Ouvrant à la française',
    casement_out: 'Ouvrant à l’anglaise',
    tilt_turn: 'Oscillo-battant',
    tilt: 'Abattant (soufflet)',
    awning: 'Fenêtre à projection',
    casement_double: 'Fenêtre 2 vantaux',
    fixed_casement: 'Fixe + ouvrant',
    fixed_tilt_turn: 'Fixe + oscillo-battant',
    casement_transom: 'Ouvrant avec imposte',
    fixed_awning_bottom: 'Fixe + projection en partie basse',
    fixed_3: 'Trois fixes',
    casement_fixed_casement: 'Ouvrant + fixe + ouvrant',
    door: 'Porte',
    door_double: 'Porte 2 vantaux',
    door_sidelight: 'Porte avec fixe latéral',
    door_transom: 'Porte avec imposte',
    arch: 'Plein cintre',
    trapezoid: 'Fixe trapézoïdal',
    triangle: 'Fixe triangulaire',
    sliding_2: 'Coulissant 2 vantaux',
    sliding_2_fixed: 'Coulissant vantail + fixe',
    sliding_3: 'Coulissant 3 vantaux',
    sliding_3_rail: 'Coulissant 3 vantaux, 3 rails',
    sliding_4: 'Coulissant 4 vantaux',
    sliding_mono: 'Coulissant monorail',
    sliding_6: 'Coulissant 6 vantaux',
    sliding_3_center_fixed: 'Coulissant 3 vantaux, fixe central',
    sliding_4_center_fixed: 'Coulissant 4 vantaux, fixes centraux',
    lift_slide_2: 'Levant-coulissant 2 vantaux',
    lift_slide_3: 'Levant-coulissant 3 vantaux',
    lift_slide_4: 'Levant-coulissant 4 vantaux',
    tilt_slide: 'Oscillo-coulissant',
    tilt_slide_2: 'Oscillo-coulissant 2 vantaux',
    parallel_slide: 'Coulissant à translation',
    folding_3: 'Pliant 3 vantaux',
    folding_4: 'Pliant 4 vantaux',
    folding_5: 'Pliant 5 vantaux',
    folding_6: 'Pliant 6 vantaux',
    folding_7: 'Pliant 7 vantaux',
    pivot_v: 'Pivotant',
    pivot_h: 'Basculant',
    french_casement: 'Fenêtre à la française 2 vantaux',
    french_tilt_turn: 'Oscillo-battant 2 vantaux',
    balcony_door: 'Porte-fenêtre',
    balcony_door_double: 'Porte-fenêtre 2 vantaux',
    entrance_door: 'Porte d’entrée',
    entrance_door_sidelights: 'Porte d’entrée avec fixes latéraux',
    door_double_sidelights: 'Porte 2 vantaux avec fixes latéraux',
    fixed_tilt_turn_fixed: 'Fixe + oscillo-battant + fixe',
    tilt_turn_double_transom: 'Oscillo-battant 2 vantaux avec imposte',
    round: 'Œil-de-bœuf fixe',
    oval: 'Fixe ovale',
    pentagon: 'Fixe pentagonal',
    octagon: 'Fixe octogonal',
    gable: 'Fixe en pignon',
    arch_segmental: 'Cintre surbaissé',
    arch_casement: 'Plein cintre fixe sur ouvrant',
    casement_bottom_fixed: 'Battant avec allège vitrée',
    tilt_turn_bottom_fixed: 'Oscillo-battant avec allège vitrée',
    casement_double_bottom_fixed: 'Deux vantaux avec allège vitrée',
    tilt_turn_transom: 'Oscillo-battant avec imposte',
    awning_transom: 'Projetant au-dessus d’un fixe',
    fixed_tilt: 'Fixe avec soufflet en haut',
    fixed_awning_side: 'Fixe + projetant latéral',
    casement_double_mullion: 'Deux vantaux avec meneau',
    tilt_turn_fixed_tilt_turn: 'Oscillo-battant + fixe + oscillo-battant',
    door_panel: 'Porte pleine',
    door_zocalo: 'Porte avec soubassement',
    door_double_zocalo: 'Porte deux vantaux avec soubassement',
    door_out: 'Porte ouvrant vers l’extérieur',
    vertical_sliding: 'Fenêtre à guillotine',
    vertical_sliding_double: 'Guillotine double',
    louver_fixed: 'Persienne fixe',
  },
  typologyGroup: {
    window: 'Fenêtres',
    door: 'Portes',
    sliding: 'Coulissants',
    folding: 'Pliants',
    shape: 'Formes',
    liftParallel: 'Levants et à translation',
    pivot: 'Pivotants et basculants',
  },
  opening: {
    fixed: 'Fixe',
    casement: 'Battant',
    tilt_turn: 'Oscillo-battant',
    tilt: 'Abattant (soufflet)',
    awning: 'Projection',
    door: 'Porte',
    pivot_v: 'Pivotant',
    pivot_h: 'Basculant',
    tilt_slide: 'Oscillo-coulissant (PSK)',
    parallel_slide: 'Coulissant à translation',
    folding: 'Pliant',
  },
  openingHint: {
    fixed: 'N’ouvre pas : vitrage fixe dans le dormant.',
    casement: 'Pivote sur des paumelles latérales.',
    tilt_turn: 'S’ouvre vers l’intérieur et bascule aussi par le haut pour aérer.',
    tilt: 'Charnières en bas : le haut bascule vers l’intérieur.',
    awning: 'Charnières en haut : le bas se projette vers l’extérieur.',
    door: 'Porte battante sur paumelles latérales.',
    pivot_v: 'Tourne sur un axe vertical.',
    pivot_h: 'Tourne sur un axe horizontal.',
    tilt_slide: 'Bascule pour aérer, puis se décale du dormant pour coulisser en parallèle.',
    parallel_slide: 'Se décale du dormant et coulisse en parallèle, sans basculer.',
    folding: 'Vantaux reliés qui se replient en accordéon sur un côté.',
  },
  sliding: {
    system: { standard: 'Coulissant standard', lift_slide: 'Levant-coulissant (HS)', vertical: 'Guillotine' },
    systemHint: {
      standard: 'Les vantaux roulent sur leur rail.',
      lift_slide: 'La poignée soulève le vantail avant de coulisser ; en l’abaissant, il fait étanchéité contre le dormant.',
      vertical: 'Les vantaux montent et descendent le long des montants.',
    },
    panel: { moving: 'Vantail mobile', fixed: 'Vantail fixe' },
    rails: '{count, plural, one {# rail} other {# rails}}',
    panels: '{count, plural, one {# vantail} other {# vantaux}}',
  },
  direction: { in: 'Vers l’intérieur', out: 'Vers l’extérieur' },
  hinge: { left: 'Paumelles à gauche', right: 'Paumelles à droite' },
  side: { left: 'Gauche', right: 'Droite', top: 'Haut', bottom: 'Bas', center: 'Centre' },
  slide: { left: 'S’ouvre vers la gauche', right: 'S’ouvre vers la droite' },
  sequence: { turn_first: 'Ouverture d’abord', tilt_first: 'Soufflet d’abord' },
  sequenceHint: {
    turn_first: 'La poignée ouvre d’abord le vantail, puis le bascule (cas courant).',
    tilt_first: 'La poignée bascule d’abord le vantail ; l’ouverture complète se fait à clé (sécurité enfants).',
  },
  joint: { mullion: 'Avec meneau', french: 'Battement central (sans meneau)', fold: 'Pliant' },
  leafRole: { active: 'Vantail principal', passive: 'Vantail semi-fixe' },
  leafUse: { balcony: 'Porte-fenêtre', entrance: 'Porte d’entrée' },
  view: {
    interior: 'Vue intérieure',
    exterior: 'Vue extérieure',
    convention: 'Dessin vu de l’intérieur.',
  },
  shape: {
    rect: 'Rectangulaire',
    arch: 'Plein cintre',
    arch_segmental: 'Cintre surbaissé',
    round: 'Ronde',
    oval: 'Ovale',
    pentagon: 'Pentagonale',
    octagon: 'Octogonale',
    gable: 'En pignon',
    trapezoid: 'Trapèze',
    triangle: 'Triangulaire',
  },
  accessory: {
    rollerShutter: 'Volet roulant',
    rollerShutterType: { monoblock: 'Bloc-baie (coffre sur le dormant)', exterior: 'Coffre extérieur', integrated: 'Intégré' },
    rollerShutterOperation: { strap: 'Sangle', crank: 'Manivelle', motor: 'Motorisé' },
    insectScreen: 'Moustiquaire',
    insectScreenType: { fixed: 'Fixe', hinged: 'Battante', sliding: 'Coulissante', roller: 'Enroulable', pleated: 'Plissée' },
    sill: 'Appui de fenêtre',
    threshold: 'Seuil bas',
    fullFrame: 'Dormant complet',
  },
  /** Sustantivos en plural para interpolar en avisos (`hardware_missing.target`). */
  hardwareTarget: { fixed: 'châssis fixes', casement: 'ouvrants battants', tilt_turn: 'ouvrants oscillo-battants', tilt: 'abattants', awning: 'ouvrants à projection', door: 'portes', pivot_v: 'ouvrants pivotants', pivot_h: 'ouvrants basculants', tilt_slide: 'vantaux oscillo-coulissants', parallel_slide: 'vantaux à translation', folding: 'vantaux pliants', sliding_moving: 'vantaux coulissants', sliding_fixed: 'fixes de coulissant', lift_slide_moving: 'vantaux levants-coulissants', lift_slide_fixed: 'fixes de levant-coulissant', vertical_moving: 'vantaux à guillotine', vertical_fixed: 'fixes de guillotine' },
  /** Accesorios en plural para interpolar en avisos (`extra_rules_missing.extra`). */
  extraPlural: { rollerShutter: 'volets roulants', insectScreen: 'moustiquaires', sill: 'appuis de fenêtre', threshold: 'seuils' },
  product: { window: 'Fenêtre', door: 'Porte', windows: 'Fenêtres', doors: 'Portes' },
  profileRole: {
    frame: 'Dormant',
    sash: 'Ouvrant',
    door_sash: 'Ouvrant de porte',
    mullion: 'Meneau',
    bead: 'Parclose',
    french_mullion: 'Battement',
    threshold: 'Seuil',
    sliding_frame: 'Dormant coulissant',
    sliding_sash: 'Ouvrant coulissant',
    interlock: 'Chicane centrale',
    guide: 'Rail',
    coupler: 'Raccord',
    reinforcement: 'Renfort',
    other: 'Autre',
  },
  part: {
    pane: 'Panneau',
    glass: 'Vitrage',
    post: 'Meneau',
    transomLight: 'Imposte',
    sidelight: 'Fixe latéral',
    handle: 'Poignée',
    hinge: 'Paumelle',
    espagnolette: 'Crémone',
    hardware: 'Quincaillerie',
    gasket: 'Joint',
    rail: 'Rail',
    roller: 'Galet',
    blindPanel: 'Panneau plein',
  },
  finish: { smooth: 'Lisse', woodgrain: 'Veiné bois', textured: 'Texturé', metallic: 'Métallisé' },
  lineKind: { casement: 'À frappe', sliding: 'Coulissant' },
  material: { pvc: 'PVC', aluminum: 'Aluminium' },
  glassKind: { dvh: 'Double vitrage', mono: 'Simple vitrage', laminated: 'Feuilleté', tempered: 'Trempé', other: 'Autre' },
  glass: {
    single: 'Simple vitrage',
    double: 'Double vitrage',
    triple: 'Triple vitrage',
    laminated: 'Feuilleté',
    tempered: 'Trempé',
    low_e: 'Faible émissivité (Low-E)',
    frosted: 'Dépoli',
    acoustic: 'Acoustique',
    solar_control: 'Contrôle solaire',
    spacer: 'Intercalaire',
    warm_edge: 'Bord chaud (warm edge)',
    argon: 'Gaz argon',
    cavity: 'Lame de gaz',
    thickness: 'Épaisseur',
    composition: 'Composition',
  },
  itemKind: { hardware: 'Quincaillerie', accessory: 'Accessoire', consumable: 'Consommable', other: 'Autre' },
  unit: {
    mm: 'mm',
    cm: 'cm',
    m: 'm',
    m2: 'm²',
    kg: 'kg',
    pieces: '{count, plural, one {# unité} other {# unités}}',
    bars: '{count, plural, one {# barre} other {# barres}}',
    windows: '{count, plural, one {# fenêtre} other {# fenêtres}}',
    items: '{count, plural, one {# article} other {# articles}}',
    days: '{count, plural, one {# jour} other {# jours}}',
  },
  hardwareUnit: { u: 'u', kit: 'kit', m: 'm', m2: 'm²', caja: 'boîte', cartucho: 'cartouche', par: 'paire' },
  dimension: {
    width: 'Largeur',
    height: 'Hauteur',
    size: 'Dimensions',
    widthByHeight: 'Largeur × hauteur',
    area: 'Surface',
    perimeter: 'Périmètre',
    weight: 'Poids',
    quantity: 'Quantité',
  },
  quoteStatus: {
    draft: 'Brouillon',
    sent: 'Envoyé',
    accepted: 'Accepté',
    rejected: 'Refusé',
    workshop: 'En fabrication',
    installed: 'Posé',
    closed: 'Clôturé',
  },
  workOrderStatus: { open: 'À démarrer', in_progress: 'En fabrication', done: 'Prêt' },
  station: {
    cut: 'Débit',
    weld: 'Soudure',
    assembly: 'Assemblage',
    hardware: 'Ferrage',
    glazing: 'Vitrage',
    qc: 'Contrôle',
    ready: 'Prêt',
    installed: 'Posé',
  },
  role: {
    owner: 'Propriétaire',
    estimator: 'Chiffreur',
    workshop: 'Chef d’atelier',
    operator: 'Opérateur',
    installer: 'Poseur',
  },
  roleDescription: {
    owner: 'Voit et fait tout, y compris coûts, abonnement et équipe.',
    estimator: 'Crée et envoie les devis. Ne voit ni coûts ni marges.',
    workshop: 'Gère ordres de fabrication, débits, vitrages et matériaux. Ne voit pas les prix de vente.',
    operator: 'Voit ses tâches de production et signale l’avancement.',
    installer: 'Voit les poses assignées, la checklist et les photos.',
  },
  plan: {
    trial: 'Essai Pro',
    taller: 'Atelier',
    pro: 'Pro',
    empresa: 'Entreprise',
    empresa2x: 'Entreprise 2×',
  },
  planTagline: {
    taller: 'Pour ceux qui chiffrent, débitent et fabriquent.',
    pro: 'Bureau et atelier main dans la main.',
    empresa: 'Une usine avec équipes et postes.',
    empresa2x: 'Gros volumes et IA à fond.',
  },
  feature: {
    assistant: { title: 'Marco avec IA', why: 'Marco prépare des devis complets à partir d’un message, d’une photo ou d’une liste de dimensions.' },
    client3d: { title: 'Vue 3D pour le client', why: 'Votre client fait pivoter la fenêtre, la voit dans sa couleur et l’ouvre avant de valider.' },
    purchasing: { title: 'Bons de commande', why: 'Transformez les matériaux d’un ordre de fabrication en commandes fournisseurs en un clic.' },
    cnc: { title: 'Export vers les scies', why: 'Envoyez la liste de débit optimisée directement à votre scie ou centre d’usinage.' },
    roles: { title: 'Rôles et autorisations', why: 'Chacun voit ce qui le concerne : chiffreurs sans coûts, atelier sans prix.' },
    stations: { title: 'Postes de production', why: 'Suivez chaque fenêtre au débit, à la soudure, à l’assemblage et au vitrage.' },
    field: { title: 'Chantier', why: 'Mesurez les baies et posez depuis votre téléphone ; tout remonte au dossier.' },
    multiBranch: { title: 'Plusieurs agences', why: 'Séparez chantiers et numérotation par agence avec un seul catalogue.' },
    custom_templates: { title: 'Modèles personnalisés', why: 'Créez vos propres mises en page de devis et de catalogue, à la main ou en le demandant à l’assistant.' },
    texture_upload: {
      title: 'Textures personnalisées',
      why: 'Envoyez la photo de votre film décoratif et vos fenêtres sont dessinées avec ce veinage réel dans les devis et le portail client.',
    },
  },
  pane: {
    label:
      '{kind, select, fixed {le châssis fixe} door {la porte} other {l’ouvrant}}{v, select, top {{kind, select, door { supérieure} other { supérieur}}} bottom {{kind, select, door { inférieure} other { inférieur}}} middle { du milieu} other {}}{h, select, left { gauche} right {{kind, select, door { droite} other { droit}}} center {{kind, select, door { centrale} other { central}}} other {}}{n, plural, =0 {} other { #}}',
    labelOf:
      '{kind, select, fixed {du châssis fixe} door {de la porte} other {de l’ouvrant}}{v, select, top {{kind, select, door { supérieure} other { supérieur}}} bottom {{kind, select, door { inférieure} other { inférieur}}} middle { du milieu} other {}}{h, select, left { gauche} right {{kind, select, door { droite} other { droit}}} center {{kind, select, door { centrale} other { central}}} other {}}{n, plural, =0 {} other { #}}',
  },
  profileSubject: {
    frame: 'Le dormant',
    sash: 'L’ouvrant',
    door_sash: 'L’ouvrant de porte',
    mullion: 'Le meneau',
    bead: 'La parclose',
    french_mullion: 'Le battement',
    threshold: 'Le seuil',
    sliding_frame: 'Le dormant coulissant',
    sliding_sash: 'L’ouvrant coulissant',
    interlock: 'La chicane centrale',
    guide: 'Le rail',
    coupler: 'Le raccord',
    reinforcement: 'Le renfort',
    other: 'Le profilé',
  },
  openingLimit: {
    casement: 'un ouvrant battant',
    casement_out: 'un ouvrant battant ouvrant vers l’extérieur',
    awning: 'un ouvrant à projection',
    tilt_turn: 'un ouvrant oscillo-battant',
    tilt_turn_door: 'une porte oscillo-battante',
    door: 'un ouvrant de porte',
    tilt: 'un abattant',
    pivot_h: 'un ouvrant basculant',
    pivot_v: 'un ouvrant pivotant',
    tilt_slide: 'un vantail oscillo-coulissant',
    parallel_slide: 'un vantail à translation',
    folding: 'un vantail pliant',
    folding_access: 'le vantail de passage d’un pliant',
    sliding: 'un vantail coulissant',
    lift_slide: 'un vantail levant-coulissant',
  },
  pautaField: {
    weld: 'la soudure',
    frameDeduction: 'la déduction du dormant',
    sashWidth: 'la largeur d’ouvrant',
    sashDeduction: 'la déduction d’ouvrant',
    sashOverlap: 'le recouvrement d’ouvrant',
    glassGap: 'le jeu du vitrage',
    mullionDeduction: 'la déduction du meneau',
  },
  accessoryPer: {
    window: 'par fenêtre',
    sash: 'par ouvrant',
    mullion: 'par meneau',
    glass_m: 'par mètre de vitrage',
    frame_m: 'par mètre de dormant',
    reinforcement_m: 'par mètre de renfort',
    perimeter_m: 'par mètre de périmètre',
    width_m: 'par mètre de largeur',
    height_m: 'par mètre de hauteur',
    area_m2: 'par m²',
    coupler_m: 'par mètre d’accouplement',
  },
  warningLevel: { info: 'Note', warn: 'Attention', error: 'Erreur' },
  warning: {
    line_missing:
      '{source, select, pricing {La gamme de cette fenêtre n’est plus dans votre catalogue : le prix est calculé sans remises de marque.} other {Nous n’avons pas trouvé la gamme de cette fenêtre : nous avons calculé avec un tableau de débit PVC type. Choisissez une gamme pour des débits exacts.}}',
    pauta_incomplete:
      'Il manque {fields} dans le tableau de débit de {line} : nous avons utilisé des valeurs PVC types. Vérifiez-le dans le catalogue.',
    size_invalid: 'La fenêtre doit avoir une largeur et une hauteur supérieures à zéro.',
    threshold_missing:
      '{line} n’a pas de profilé de seuil : {kind, select, lift_slide {le levant-coulissant a été calculé} other {la porte a été calculée}} avec un dormant complet.',
    color_not_in_line: '{line} n’est pas fabriquée en {color} : vérifiez la couleur ou la gamme.',
    color_missing: 'La couleur de la fenêtre n’est pas dans le catalogue : les profilés sont chiffrés sans prix de couleur.',
    line_kind_mismatch:
      '{target, select, sliding {{line} est une gamme coulissante et cette fenêtre est à frappe : les débits peuvent ne pas correspondre.} other {{line} est une gamme à frappe et cette fenêtre est coulissante : les débits peuvent ne pas correspondre.}}',
    sliding_nested: 'Un coulissant ne peut être que la fenêtre entière : ce panneau n’a pas été calculé.',
    french_needs_sashes:
      '{dir, select, horizontal {Le battement central ne se fait qu’entre ouvrants côte à côte : nous l’avons calculé avec un meneau.} other {Le battement central exige deux ouvrants s’ouvrant chacun de leur côté : nous l’avons calculé avec un meneau.}}',
    shape_not_fixed:
      'Dans une forme spéciale, les ouvrants se placent dans sa partie rectangulaire (sous le cintre, les épaules ou le côté le plus bas)\u00a0: ceux qui la traversent ont été calculés sur le rectangle qui les contient.',
    arch_bending: 'Le dormant doit être commandé cintré (rayon extérieur {radius}) : confirmez-le avec votre fournisseur.',
    profile_missing:
      '{subject} de {line} n’est pas dans votre catalogue : {role, select, bead {elle est chiffrée} interlock {elle est chiffrée} other {il est chiffré}} à zéro. {role, select, bead {Ajoutez-la} interlock {Ajoutez-la} other {Ajoutez-le}} dans Catalogue.',
    reinforcement_deduction_missing:
      '{profile} est renforcé, mais le tableau de débit n’indique pas combien déduire : nous avons utilisé débit − {deduction}.',
    reinforcement_profile_missing:
      '{profile} est renforcé, mais aucun acier ne lui est attribué dans le catalogue : il apparaît comme « REF » sans prix.',
    glass_missing: 'Le vitrage choisi n’est pas dans le catalogue : il apparaît sans prix. Choisissez un vitrage pour le chiffrer.',
    item_missing:
      '{kind, select, hardware {Un élément de quincaillerie} other {Un accessoire}} de {line} (code {code}) n’est pas dans le catalogue : il n’entre pas dans le coût.',
    pane_impossible:
      '{variant, select, sliding {{pane} ne rentre pas : le coulissant est trop étroit pour {panels, plural, one {# vantail} other {# vantaux}}.} outside {{pane} sort de la forme : déplacez le meneau ou supprimez la division.} other {{pane} ne rentre pas : sa dimension est inférieure aux déductions du tableau de débit. Agrandissez le panneau ou supprimez une division.}}',
    sliding_panels: 'Un coulissant a besoin d’au moins deux panneaux : ajoutez un vantail.',
    sliding_no_moving: 'Ce coulissant n’a aucun vantail mobile : indiquez au moins un vantail mobile.',
    sliding_mono_estimated:
      'Monorail calculé avec le tableau de débit coulissant général : comparez vantaux et vitrages avec le gabarit de votre fournisseur avant de débiter.',
    hardware_missing:
      '{variant, select, rules {{line} n’a pas de règles de quincaillerie dans le catalogue : la fenêtre reste hors du total jusqu’à les avoir.} other {{line} n’a pas de quincaillerie pour {target} : la fenêtre reste hors du total jusqu’à l’ajouter dans le catalogue.}}',
    hardware_out_of_range:
      'Aucune quincaillerie {line} pour des ouvrants de {size} de {dim, select, width {largeur} other {hauteur}} ({coverage, select, between {couvre jusqu’à {below} mm et à partir de {above} mm} upto {couvre jusqu’à {below} mm} from {couvre à partir de {above} mm} other {couvre toutes les dimensions}}). {count, plural, one {Chiffré sans quincaillerie.} other {Les # ouvrants sont chiffrés sans quincaillerie.}}',
    accessory_rule_unknown:
      'La règle de {item} dans {line} n’indique pas comment le compter : il n’entre pas dans le coût. Vérifiez-la dans Catalogue.',
    pane_small:
      '{pane} se retrouve avec un vitrage de {size} de {dim, select, width {largeur} other {hauteur}} : trop petit pour être fabriqué et scellé correctement.',
    glass_too_big:
      '{variant, select, mono {Le vitrage {paneOf} mesure {area} : un simple vitrage de {thickness} au-delà de {max} peut casser. Utilisez un vitrage plus épais, feuilleté ou un double vitrage.} other {Le double vitrage {paneOf} mesure {area} : au-delà de {max}, il est trop lourd à manipuler et à poser. Divisez le panneau avec un meneau.}}',
    price_missing_profile:
      '{variant, select, reinforcement {Le renfort {code} n’a pas de prix : il reste hors du total.} other {Le profilé {code} n’a pas de prix en {color} : il reste hors du total.}}',
    price_missing_glass: 'Le vitrage {glass} n’a pas de prix au m² : il reste hors du total.',
    price_missing_item:
      '{kind, select, hardware {La quincaillerie} consumable {Le consommable} other {L’accessoire}} {code} · {name} n’a pas de prix : chiffré à zéro.',
    price_missing:
      '{variant, select, many {{count} matériaux n’ont pas de prix ({shown} et {rest} autres) : la fenêtre reste hors du total jusqu’à les avoir. Complétez-les dans Catalogue › Mes prix.} other {{kind, select, profile {Le profilé} reinforcement {Le renfort} glass {Le vitrage} hardware {La quincaillerie} accessory {L’accessoire} consumable {Le consommable} other {L’article}} {ref} {issue, select, not_in_catalog {n’est pas dans votre catalogue} no_price_color {n’a pas de prix en {color}} no_price_m2 {n’a pas de prix au m²} other {n’a pas de prix}} : prix retenu à zéro.}}',
    qty_invalid: 'La quantité n’est pas valide : 1 unité est chiffrée.',
    margin_invalid:
      '{variant, select, high {Une marge de {pct} sur le prix de vente est impossible : 95 % a été appliqué. Pour multiplier le coût, utilisez la majoration.} other {La marge ne peut pas être négative ({pct}) : 0 % a été appliqué.}}',
    manual_price_invalid: 'Le prix manuel n’est pas valide : le prix calculé est utilisé.',
    manual_price: 'Prix manuel. Le prix calculé serait de {price}.',
    below_cost: 'Le prix manuel ({price}) est inférieur au coût ({cost}) : vous perdez {loss} par unité.',
    no_materials:
      '{variant, select, empty {Cette fenêtre n’a pas encore de matériaux calculés.} other {Cette fenêtre n’a pas encore de matériaux calculés : le prix ne comprend que la main-d’œuvre et la pose.}}',
    piece_too_long:
      '{variant, select, labeled {La pièce de {length} ({label}) ne rentre pas dans une barre de {bar} : il vous faut une barre spéciale d’au moins {needed}.} other {La pièce de {length} ne rentre pas dans une barre de {bar} : il vous faut une barre spéciale d’au moins {needed}.}}',
    too_many_units: 'La pièce {piece} demande {qty} unités : seules les {max} premières ont été optimisées.',
    invalid_piece:
      '{count, plural, one {Une pièce sans longueur valide a été exclue de l’optimisation.} other {# pièces sans longueur valide ont été exclues de l’optimisation.}}',
    element_too_large:
      '{kind, select, lift_slide {Le levant-coulissant mesure {width} de large\u00a0: les systèmes publiés vont jusqu’à {max}. Divisez-le ou confirmez avec votre fournisseur.} other {L’ensemble pliant mesure {width} de large\u00a0: les systèmes publiés vont jusqu’à {max}. Divisez-le ou confirmez avec votre fournisseur.}}',
    extra_rules_missing:
      '{line} n’a pas de prix pour les {extra} dans le catalogue : le dessin les montre, mais la fenêtre reste hors du total. Ajoutez-les dans Catalogue › Accessoires.',
    fold_needs_folding_leaves:
      '{dir, select, horizontal {Un pliant ne se monte qu’avec des vantaux côte à côte\u00a0: nous l’avons calculé avec un meneau.} other {La jonction pliante exige des vantaux pliants de chaque côté\u00a0: nous l’avons calculée avec un meneau.}}',
    folding_groups:
      'Les vantaux qui se replient à gauche doivent être regroupés à gauche, et ceux de droite à droite\u00a0: vérifiez le sens de repli de chaque vantail.',
    folding_needs_chain:
      'Un vantail pliant doit être relié à d’autres vantaux pliants\u00a0: il a été calculé comme un ouvrant isolé. Utilisez une typologie pliante.',
    round_not_square: 'Une fenêtre ronde a la même largeur et la même hauteur : avec {width} × {height}, elle a été calculée comme un ovale.',
    shape_bending:
      '{shape, select, round {Le dormant rond doit être commandé cintré (rayon minimal {radius})\u00a0: confirmez-le avec votre fournisseur.} other {Le dormant ovale doit être commandé cintré (rayon minimal {radius})\u00a0: confirmez-le avec votre fournisseur.}}',
    sliding_too_many_panels:
      'Un coulissant se fabrique avec {max} vantaux au maximum\u00a0: avec {count}, mieux vaut le diviser en deux fenêtres couplées.',
    bom_failed: 'Nous n’avons pas pu calculer les matériaux de cette fenêtre. Vérifiez ses dimensions ou la gamme choisie.',
    opening_too_large:
      '{pane} mesure {width} × {height} mm (ouvrant fini) : la plage typique pour {limit} va de {minW} à {maxW} mm de large et de {minH} à {maxH} mm de haut. Confirmez-la avec votre fournisseur de quincaillerie.',
    opening_too_small:
      '{pane} mesure {width} × {height} mm (ouvrant fini) : la plage typique pour {limit} va de {minW} à {maxW} mm de large et de {minH} à {maxH} mm de haut. Confirmez-la avec votre fournisseur de quincaillerie.',
    panel_rules_missing:
      '{line} n’a pas de prix pour les panneaux pleins dans le catalogue : le dessin les montre, mais la fenêtre reste hors du total. Ajoutez-le dans Catalogue › Accessoires.',
    louver_rules_missing:
      '{line} n’a pas de prix pour les persiennes dans le catalogue : le dessin les montre, mais la fenêtre reste hors du total. Ajoutez-le dans Catalogue › Accessoires.',
    vertical_slide_unsupported:
      '{line} n’a pas de vantail à guillotine dans le catalogue : cette fenêtre reste sans prix. Choisissez une gamme qui le fabrique.',
    zocalo_invalid:
      'Un soubassement de {height} ne tient pas dans ce vantail (maximum {max}) : calculé sans soubassement.',
    frame_addon_missing:
      'Une pièce de contour n’est plus dans {line} : elle n’a été ni coupée ni comptée. Choisissez-en une autre.',
    assembly_joint_missing:
      '{variant, select, flat {{line} n’a pas de profilé d’accouplement dans le catalogue : la jonction {joint} reste sans pièce et hors du total.} other {{line} n’a pas de poteau pour {angle}° dans le catalogue : la jonction {joint} reste sans pièce et hors du total. Utilisez un angle permis par le système.}}',
    assembly_post_unverified:
      'Le poteau d’angle {profile} n’indique pas son angle dans le catalogue : il a été utilisé à 90°. Confirmez-le avec votre fournisseur.',
    assembly_post_no_steel:
      'Le poteau {profile} n’a pas de renfort attribué dans le catalogue : vérifiez avec votre fournisseur s’il en faut un.',
    assembly_coupler_no_face:
      '{profile} n’a pas de largeur vue dans le catalogue : la largeur totale ne l’inclut pas. Ajoutez-la pour une cote exacte.',
    assembly_mixed_systems:
      'La jonction {joint} réunit {a} et {b}, qui ne sont pas du même système : confirmez avec votre fournisseur que l’accouplement convient aux deux.',
    assembly_no_contact:
      'Les unités {joint} ne se touchent pas : vérifiez leurs cotes ou leur alignement.',
    price_pending:
      '{scope, select, part {Une partie de cet ensemble reste} other {Cette fenêtre reste}} hors du total jusqu’à avoir un prix : il manque {shown}{rest, plural, =0 {} other { et # autres}}.',
    french_gap_missing:
      'La table de {line} n’indique pas l’écart entre les vantaux : ils ont été calculés jusqu’à l’axe. Comparez la coupe avec le gabarit de votre fournisseur.',
    bead_no_fit:
      'Aucune parclose de {line} ne convient à un vitrage de {thickness} : vérifiez le vitrage ou la gamme.',
    glazing_out_of_range:
      '{line} accepte des vitrages de {min} à {max} mm : {thickness} mm ne tient pas.',
    supplier_limit_exceeded:
      '{pane} mesure {width} × {height} mm : {line} publie de {minW} à {maxW} mm de large et de {minH} à {maxH} mm de haut.',
    bar_length_unknown:
      '{profile} n’a pas de longueur de barre dans le catalogue ni dans Réglages › Atelier : ses coupes n’ont pas été optimisées.',
    bar_length_missing:
      '{profile} n’a pas de longueur de barre dans le catalogue : l’optimisation utilise celle de Réglages › Atelier.',
  },
  warningGeneric: {
    line_missing: 'Nous n’avons pas trouvé la gamme de cette fenêtre dans votre catalogue : vérifiez la gamme choisie.',
    pauta_incomplete:
      'Il manque des données dans le tableau de débit de la gamme : nous avons utilisé des valeurs PVC types. Vérifiez-le dans le catalogue.',
    size_invalid: 'La fenêtre doit avoir une largeur et une hauteur supérieures à zéro.',
    threshold_missing: 'La gamme n’a pas de profilé de seuil : la porte a été calculée avec un dormant complet.',
    color_not_in_line: 'La gamme n’est pas fabriquée dans cette couleur : vérifiez la couleur ou la gamme.',
    color_missing: 'La couleur de la fenêtre n’est pas dans le catalogue : les profilés sont chiffrés sans prix de couleur.',
    line_kind_mismatch: 'La gamme et la fenêtre ne sont pas du même type (coulissant ou à frappe) : les débits peuvent ne pas correspondre.',
    sliding_nested: 'Un coulissant ne peut être que la fenêtre entière : ce panneau n’a pas été calculé.',
    french_needs_sashes: 'Le battement central exige deux ouvrants côte à côte s’ouvrant chacun de leur côté : nous l’avons calculé avec un meneau.',
    shape_not_fixed:
      'Dans une forme spéciale, les ouvrants se placent dans sa partie rectangulaire (sous le cintre, les épaules ou le côté le plus bas)\u00a0: ceux qui la traversent ont été calculés sur le rectangle qui les contient.',
    arch_bending: 'Le dormant doit être commandé cintré : confirmez-le avec votre fournisseur.',
    profile_missing: 'Un profilé de la gamme n’est pas dans votre catalogue : il reste hors du total. Ajoutez-le dans Catalogue.',
    reinforcement_deduction_missing:
      'Un profilé est renforcé, mais le tableau de débit n’indique pas combien déduire : nous avons utilisé une déduction type.',
    reinforcement_profile_missing:
      'Un profilé est renforcé, mais aucun acier ne lui est attribué dans le catalogue : il apparaît comme « REF » sans prix.',
    glass_missing: 'Le vitrage choisi n’est pas dans le catalogue : il apparaît sans prix. Choisissez un vitrage pour le chiffrer.',
    item_missing: 'Un élément de quincaillerie ou un accessoire de la gamme n’est pas dans le catalogue : il n’entre pas dans le coût.',
    pane_impossible:
      'Un panneau ne rentre pas : sa dimension est inférieure aux déductions du tableau de débit. Agrandissez le panneau ou supprimez une division.',
    sliding_panels: 'Un coulissant a besoin d’au moins deux panneaux : ajoutez un vantail.',
    sliding_no_moving: 'Ce coulissant n’a aucun vantail mobile : indiquez au moins un vantail mobile.',
    sliding_mono_estimated:
      'Monorail calculé avec le tableau de débit coulissant général : comparez vantaux et vitrages avec le gabarit de votre fournisseur avant de débiter.',
    hardware_missing: 'La gamme n’a pas de quincaillerie pour ce type d’ouverture : la fenêtre est chiffrée sans.',
    hardware_out_of_range: 'Aucune quincaillerie de la gamme pour cette dimension d’ouvrant : chiffré sans quincaillerie.',
    accessory_rule_unknown: 'Une règle d’accessoire n’indique pas comment le compter : il n’entre pas dans le coût. Vérifiez-la dans Catalogue.',
    pane_small: 'Un vitrage est trop petit pour être fabriqué et scellé correctement.',
    glass_too_big: 'Un vitrage est trop grand pour être fabriqué et posé en sécurité : divisez le panneau ou utilisez un vitrage plus résistant.',
    price_missing_profile: 'Un profilé n’a pas de prix : il reste hors du total.',
    price_missing_glass: 'Un vitrage n’a pas de prix au m² : il reste hors du total.',
    price_missing_item: 'Un élément de quincaillerie ou un accessoire n’a pas de prix : il reste hors du total.',
    price_missing:
      'Des matériaux n’ont pas de prix : la fenêtre reste hors du total jusqu’à les avoir. Complétez-les dans Catalogue › Mes prix.',
    qty_invalid: 'La quantité n’est pas valide : 1 unité est chiffrée.',
    margin_invalid: 'La marge n’est pas valide : elle a été ajustée à la valeur possible la plus proche.',
    manual_price_invalid: 'Le prix manuel n’est pas valide : le prix calculé est utilisé.',
    manual_price: 'Prix manuel : il remplace le prix calculé.',
    below_cost: 'Le prix manuel est inférieur au coût : vous perdez de l’argent sur chaque unité.',
    no_materials: 'Cette fenêtre n’a pas encore de matériaux calculés.',
    piece_too_long: 'Une pièce est plus longue que la barre : il vous faut une barre spéciale.',
    too_many_units: 'Une pièce demande trop d’unités : seule une partie a été optimisée.',
    invalid_piece: 'Des pièces sans longueur valide ont été exclues de l’optimisation.',
    element_too_large: 'L’ensemble est plus large que ce que permettent les systèmes publiés\u00a0: divisez-le ou confirmez avec votre fournisseur.',
    extra_rules_missing:
      'La gamme n’a pas de prix pour un accessoire : le dessin le montre, mais la fenêtre reste hors du total. Ajoutez-le dans Catalogue › Accessoires.',
    fold_needs_folding_leaves: 'La jonction pliante exige des vantaux pliants côte à côte\u00a0: nous l’avons calculée avec un meneau.',
    folding_groups:
      'Les vantaux qui se replient à gauche doivent être regroupés à gauche, et ceux de droite à droite\u00a0: vérifiez le sens de repli de chaque vantail.',
    folding_needs_chain:
      'Un vantail pliant doit être relié à d’autres vantaux pliants\u00a0: il a été calculé comme un ouvrant isolé. Utilisez une typologie pliante.',
    round_not_square: 'Une fenêtre ronde a la même largeur et la même hauteur\u00a0: avec ces dimensions, elle a été calculée comme un ovale.',
    shape_bending: 'Le dormant courbe doit être commandé cintré\u00a0: confirmez-le avec votre fournisseur.',
    sliding_too_many_panels:
      'Ce coulissant a plus de vantaux qu’un seul dormant ne le permet\u00a0: mieux vaut le diviser en deux fenêtres couplées.',
    bom_failed: 'Nous n’avons pas pu calculer les matériaux de cette fenêtre. Vérifiez ses dimensions ou la gamme choisie.',
    opening_too_large: 'Un ouvrant sort de la plage typique de sa quincaillerie : confirmez-le avec votre fournisseur de quincaillerie.',
    opening_too_small: 'Un ouvrant sort de la plage typique de sa quincaillerie : confirmez-le avec votre fournisseur de quincaillerie.',
    panel_rules_missing:
      'La gamme n’a pas de prix pour les panneaux pleins : le dessin les montre, mais la fenêtre reste hors du total. Ajoutez-le dans Catalogue › Accessoires.',
    louver_rules_missing:
      'La gamme n’a pas de prix pour les persiennes : le dessin les montre, mais la fenêtre reste hors du total. Ajoutez-le dans Catalogue › Accessoires.',
    vertical_slide_unsupported:
      'La gamme n’a pas de vantail à guillotine dans le catalogue : cette fenêtre reste sans prix.',
    zocalo_invalid:
      'Le soubassement ne tient pas dans ce vantail : calculé sans soubassement.',
    frame_addon_missing:
      'Une pièce de contour n’est plus dans la gamme : elle n’a été ni coupée ni comptée.',
    assembly_joint_missing:
      'La gamme n’a pas la pièce pour cette jonction : elle reste hors du total.',
    assembly_post_unverified:
      'Un poteau d’angle n’indique pas son angle dans le catalogue : confirmez-le avec votre fournisseur.',
    assembly_post_no_steel:
      'Un poteau n’a pas de renfort attribué dans le catalogue : vérifiez avec votre fournisseur.',
    assembly_coupler_no_face:
      'Un accouplement n’a pas de largeur vue dans le catalogue : la largeur totale ne l’inclut pas.',
    assembly_mixed_systems:
      'Cette jonction réunit deux systèmes différents : confirmez avec votre fournisseur que l’accouplement convient aux deux.',
    assembly_no_contact:
      'Deux unités de l’ensemble ne se touchent pas : vérifiez leurs cotes.',
    price_pending:
      'Reste hors du total jusqu’à avoir un prix.',
    french_gap_missing:
      'La table de la gamme n’indique pas l’écart entre les vantaux : comparez la coupe avec le gabarit de votre fournisseur.',
    bead_no_fit:
      'Aucune parclose de la gamme ne convient à ce vitrage : vérifiez le vitrage ou la gamme.',
    glazing_out_of_range:
      'La gamme n’accepte pas cette épaisseur de vitrage.',
    supplier_limit_exceeded:
      'Un vantail dépasse la limite publiée par le fabricant de la gamme.',
    bar_length_unknown:
      'Un profilé n’a pas de longueur de barre dans le catalogue ni dans Réglages › Atelier : ses coupes n’ont pas été optimisées.',
    bar_length_missing:
      'Un profilé n’a pas de longueur de barre dans le catalogue : l’optimisation utilise celle de Réglages › Atelier.',
  },
  warningFix: {
    use: 'Utiliser {name}',
    to_sliding: 'Convertir en coulissant',
    to_casement: 'Convertir en frappe',
    use_mullion: 'Utiliser un meneau',
    make_fixed: 'Passer en fixe',
    square: 'Passer à {width} × {height}',
    use_first_color: 'Utiliser sa première couleur',
  },
  business: {
    quote: 'Devis',
    quotes: 'Devis',
    client: 'Client',
    clients: 'Clients',
    workOrder: 'Ordre de fabrication',
    workOrderShort: 'OF',
    job: 'Chantier',
    catalog: 'Catalogue',
    brand: 'Marque',
    line: 'Gamme',
    color: 'Couleur',
    colorOut: 'Couleur extérieure',
    colorIn: 'Couleur intérieure',
    foil: 'Film décoratif',
    texture: 'Texture',
    cutDeductions: 'Tableau de débit',
    template: 'Modèle',
    price: 'Prix',
    unitPrice: 'Prix unitaire',
    subtotal: 'Sous-total',
    net: 'Montant HT',
    vat: 'TVA',
    total: 'Total',
    discount: 'Remise',
    margin: 'Marge',
    markup: 'Majoration',
    installation: 'Pose',
    delivery: 'Livraison',
    deposit: 'Acompte',
    validity: 'Validité',
    leadTime: 'Délai de livraison',
  },
}

export default fr

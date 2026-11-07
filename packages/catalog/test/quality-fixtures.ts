/**
 * Marca inventada «Cordillera» para probar la calidad del importador (nunca datos reales):
 * rótulas, mosquiteros y tapas que no deben ser estructura, poste inversor, sufijos de color en
 * el SKU, perfiles comunes, variantes de corredera (triple riel, hoja 100), una línea sin precios,
 * duplicados comerciales, unidades dudosas y una lista de vidrios con cosas que no son vidrio.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HEADER = 'ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio'
const csv = (lines: string[]) => '﻿' + [HEADER, ...lines].join('\r\n') + '\r\n'

const P60 = 'Cordillera 60'
const C70 = 'Cordillera Corredera 70'
const S50 = 'Cordillera 50'

const CORDILLERA_ROWS = [
  // Practicable 60: estructura completa con precio en blanco y nogal.
  `5001;Cordillera;Perfil · Marco;CO100-BL;Marco fijo 60 mm;${P60};BLANCO;$;CLP;20000,00`,
  `5002;Cordillera;Perfil · Marco;CO100-NO;Marco fijo 60 mm;${P60};NOGAL;$;CLP;30000,00`,
  `5003;Cordillera;Perfil · Hoja;CO200;Hoja ventana exterior 78 mm;${P60};BLANCO;$;CLP;25000,00`,
  // Sufijo «N» de nogal pegado al código (CO200N): es el mismo perfil CO200.
  `5004;Cordillera;Perfil · Hoja;CO200N;Hoja ventana exterior 78 mm;${P60};NOGAL;$;CLP;36000,00`,
  `5005;Cordillera;Perfil · Hoja;CO210-BL;Hoja puerta 108 mm;${P60};BLANCO;$;CLP;39000,00`,
  `5006;Cordillera;Perfil · Hoja;CO210-NO;Hoja puerta 108 mm;${P60};NOGAL;$;CLP;49000,00`,
  `5007;Cordillera;Perfil · Palillo;CO300-BL;Travesaño 80 mm;${P60};BLANCO;$;CLP;24000,00`,
  `5008;Cordillera;Perfil · Palillo;CO300-NO;Travesaño 80 mm;${P60};NOGAL;$;CLP;33000,00`,
  // Barra T de mosquitero: más barata, pero nunca es el travesaño de la ventana.
  `5009;Cordillera;Perfil · Palillo;CO310-BL;Barra T Mosquitero;${P60};BLANCO;$;CLP;9000,00`,
  `5010;Cordillera;Perfil · Palillo;CO310-NO;Barra T Mosquitero;${P60};NOGAL;$;CLP;9000,00`,
  // Poste inversor: la unión móvil de doble hoja (no un travesaño fijo).
  `5011;Cordillera;Perfil · Palillo;CO320-BL;Poste inversor o batiente 60;${P60};BLANCO;$;CLP;22000,00`,
  `5012;Cordillera;Perfil · Palillo;CO320-NO;Poste inversor o batiente 60;${P60};NOGAL;$;CLP;31000,00`,
  `5013;Cordillera;Perfil · Junquillo;CO400-BL;Junquillo termopanel 18-20 mm;${P60};BLANCO;$;CLP;5000,00`,
  `5014;Cordillera;Perfil · Junquillo;CO400-NO;Junquillo termopanel 18-20 mm;${P60};NOGAL;$;CLP;7000,00`,
  `5015;Cordillera;Perfil · Junquillo;CO410-BL;Junquillo monolítico 4-6 mm;${P60};BLANCO;$;CLP;4000,00`,
  // Rótula y tapa con subtipo «Hoja»/«Marco»: complementos, no estructura.
  `5016;Cordillera;Perfil · Hoja;CO450-BL;Rotula (58) 450;${P60};BLANCO;$;CLP;12000,00`,
  `5017;Cordillera;Perfil · Marco;CO460-BL;Tapa refuerzo;${P60};BLANCO;$;CLP;3000,00`,
  `5018;Cordillera;Perfil · Refuerzo;CR10;Refuerzo acero para CO100 1,5 mm X 5,8;${P60};;$;CLP;9000,00`,
  // Corredera 70: doble riel, triple riel y hoja 100 con perfiles propios. Sin riel en la línea.
  `5101;Cordillera;Perfil · Marco;CO501-BL;Marco corredera doble riel 70;${C70};BLANCO;$;CLP;28000,00`,
  `5102;Cordillera;Perfil · Marco;CO502-BL;Marco corredera triple riel 70;${C70};BLANCO;$;CLP;41000,00`,
  `5103;Cordillera;Perfil · Hoja;CO511-BL;Hoja corredera 80 mm;${C70};BLANCO;$;CLP;31000,00`,
  `5104;Cordillera;Perfil · Hoja;CO513-BL;Hoja corredera 100 mm;${C70};BLANCO;$;CLP;37000,00`,
  `5105;Cordillera;Perfil · Hoja;CO515-BL;Hoja puerta corredera 98 mm;${C70};BLANCO;$;CLP;45000,00`,
  `5106;Cordillera;Perfil · Traslapo;CO520-BL;Traslapo hoja 80 mm;${C70};BLANCO;$;CLP;9000,00`,
  `5107;Cordillera;Perfil · Complementario;CO530-BL;Perfil inversor 4ta hoja;${C70};BLANCO;$;CLP;8000,00`,
  `5108;Cordillera;Perfil · Junquillo;CO540-BL;Junquillo corredera 18-20 mm;${C70};BLANCO;$;CLP;4500,00`,
  // Riel común: sin línea en la lista ni en los productos → disponible para todas las líneas.
  `5110;Cordillera;Perfil · Complementario;CORIEL;Riel aluminio corredera;;;$;CLP;6000,00`,
  `5111;Cordillera;Perfil · Unión;COAC-BL;Acople entre marcos;;BLANCO;$;CLP;7000,00`,
  // Practicable 50: perfiles sin precio (solo medidas).
  `5201;Cordillera;Perfil · Marco;CO901-BL;Marco 50 mm;${S50};BLANCO;$;CLP;0,00`,
  `5202;Cordillera;Perfil · Hoja;CO902-BL;Hoja ventana 70 mm;${S50};BLANCO;$;CLP;0,00`,
  `5203;Cordillera;Perfil · Junquillo;CO904-BL;Junquillo 18-20 mm 50;${S50};BLANCO;$;CLP;0,00`,
  // Herrajes: duplicado comercial exacto y un tornillo a $42.000 sin envase escrito.
  '5301;Cordillera;Herraje · Herraje;CH-1;Bisagra 2D blanca;;;$;CLP;1500,00',
  '5302;Cordillera;Herraje · Herraje;CH-1;Bisagra 2D blanca;;;$;CLP;1500,00',
  '5303;Cordillera;Herraje · Herraje;CH-2;Tornillo refuerzo 3,9 X 19;;;$;CLP;42000,00',
  '5304;Cordillera;Herraje · Herraje;CH-3;Manilla ventana blanca;;;$;CLP;2200,00',
  '5305;Cordillera;Herraje · Herraje;CH-4;Carro corredera 80 kg;;;$;CLP;1800,00',
]

const GLASS_ROWS = [
  // La cámara viene en la columna Color.
  '6001;Vidrios Cordillera;Perfil · Vidrio;;DVH 4 + 4;;Mate 10;$;CLP;30000,00',
  '6002;Vidrios Cordillera;Vidrio;;DVH 6 Blue Green+12+4;;;$;CLP;55000,00',
  // No son vidrio aunque vengan en la lista de vidrios.
  '6003;Vidrios Cordillera;Herraje · Hoja;120500001;PALETA ACRISTALAMIENTO ROJA (875400);;;$;CLP;19000,00',
  '6004;Vidrios Cordillera;Instalación;061700030;SILICONA MIRRORFIX PARA ESPEJO 310ML;;;$;CLP;7390,00',
]

interface Product {
  id: string
  tipo: string
  nombre: string
  descuento_marco: string
  ancho_hoja: string
  descuento_hoja: string
  linea: string
  tipologia: string
}

const product = (id: string, tipo: string, nombre: string, dm: number, ah: number, dh: number, linea: string, tipologia: string): Product => ({
  id,
  tipo,
  nombre,
  descuento_marco: dm.toFixed(1),
  ancho_hoja: ah.toFixed(1),
  descuento_hoja: dh.toFixed(1),
  linea,
  tipologia,
})

export const CORDILLERA_PRODUCTS: Product[] = [
  product('9501', '(V)', 'Ventana abatir exterior (Ma:co100 Ho:co200)', 44, 78, 58, P60, 'Abatir Exterior'),
  product('9502', '(V)', 'Ventana proyectante', 44, 78, 58, P60, 'Proyectante'),
  product('9503', '(V)', 'Paño fijo', 44, 0, 0, P60, 'Fijo'),
  product('9504', '(V)', 'Fijo con abatir', 44, 78, 58, P60, 'Ventana Fijo Abatir'),
  product('9505', '(V)', 'Ventana abatir doble', 44, 78, 58, P60, 'Ventana Abatir Doble Exterior'),
  // Puerta declarada como «(V)»: el nombre de la tipología dice que es puerta.
  product('9506', '(V)', 'Puerta exterior', 44, 108, 88, P60, 'Puerta Abatir EXTERIOR'),
  product('9601', '(V)', 'Corredera 2 hojas', 50, 80, 60, C70, 'Corredera 2 Hojas Doble Riel'),
  product('9602', '(V)', 'Corredera 2 hojas 1hf', 50, 80, 60, C70, 'Corredera 2 Hojas Doble Riel 1HF'),
  product('9603', '(V)', 'Corredera 3 hojas', 50, 80, 60, C70, 'Corredera 3 Hojas Doble Riel'),
  product('9604', '(V)', 'Corredera 2 hojas 100', 50, 100, 80, C70, 'Corredera 2 Hojas Doble Riel'),
  product('9605', '(V)', 'Corredera 2 hojas 100 1hf', 50, 100, 80, C70, 'Corredera 2 Hojas Doble Riel 1HF'),
  product('9606', '(V)', 'Corredera triple riel', 48, 80, 60, C70, 'Corredera 3 Hojas Triple Riel'),
  product('9607', '(V)', 'Corredera 6 hojas triple riel', 48, 80, 60, C70, 'Corredera 6 Hojas Triple Riel'),
  product('9701', '(V)', 'Ventana abatir', 40, 70, 52, S50, 'Abatir Exterior'),
]

function ficha(entry: Product) {
  const campo = (nombre: string, valor: string) => ({ nombre, etiqueta: nombre, tipo: 'text', valor, marcado: null })
  return {
    url: '',
    titulo: entry.nombre.toUpperCase(),
    campos: [campo('nombre', entry.nombre), campo('idFabrica', 'Cordillera'), campo('idLinea', entry.linea), campo('tipoAbertura', 'Ventana'), campo('idTipologia', entry.tipologia)],
    tablas: [],
    texto: '',
  }
}

/** Carpeta temporal con la marca Cordillera y su lista de vidrios. Devuelve su ruta. */
export function createQualitySource(): string {
  const root = mkdtempSync(join(tmpdir(), 'dekopen-quality-'))
  const items = join(root, 'items')
  mkdirSync(items, { recursive: true })
  writeFileSync(join(items, 'MisPrecios_31102026_1000.csv'), csv(CORDILLERA_ROWS))
  writeFileSync(join(items, 'MisPrecios_31102026_1001.csv'), csv(GLASS_ROWS))
  const folder = join(root, 'marcas diseños y medidas', 'Cordillera')
  mkdirSync(join(folder, 'fichas'), { recursive: true })
  writeFileSync(join(folder, 'marca.json'), JSON.stringify({ nombre: 'Cordillera' }))
  writeFileSync(join(folder, 'lineas.json'), JSON.stringify([{ id: '1', nombre: P60 }, { id: '2', nombre: C70 }, { id: '3', nombre: S50 }]))
  writeFileSync(
    join(folder, 'productos.json'),
    JSON.stringify(CORDILLERA_PRODUCTS.map(({ linea: _linea, tipologia: _tipologia, ...entry }) => ({ ...entry, avisos: [], marcado_con_error: false, perfiles: [], alertas: [] }))),
  )
  for (const entry of CORDILLERA_PRODUCTS) writeFileSync(join(folder, 'fichas', `${entry.id}.json`), JSON.stringify(ficha(entry)))
  return root
}

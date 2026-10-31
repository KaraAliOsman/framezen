/**
 * Datos sintéticos inventados para probar el importador (nunca datos reales).
 * Se escriben en una carpeta temporal con la misma estructura que la fuente real.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HEADER = 'ID;Marca;Tipo;Código;Descripción;Linea;Color;;;Precio'
const BOM = '﻿'

function csv(lines: string[]): string {
  return BOM + [HEADER, ...lines].join('\r\n') + '\r\n'
}

/** Marca de perfiles inventada «Andina» con una practicable y una corredera. */
const ANDINA_ROWS = [
  '1001;Andina;Perfil · Marco;AN100-BL;Marco practicable 62 mm;Andina 60;BLANCO;$;CLP;21000,00',
  '1002;Andina;Perfil · Marco;AN100-NO;Marco practicable 62 mm;Andina 60;NOGAL;$;CLP;30500,00',
  '1003;Andina;Perfil · Marco;AN100-AN;Marco practicable 62 mm;;ANTRACITA;$;CLP;32000,00',
  '1004;Andina;Perfil · Hoja;AN200-BL;Hoja ventana exterior 78 mm;Andina 60;BLANCO;$;CLP;26000,00',
  '1005;Andina;Perfil · Hoja;AN200-NO;Hoja ventana exterior 78 mm;;NOGAL;$;CLP;37000,00',
  '1006;Andina;Perfil · Hoja;AN210-BL;Hoja puerta 108 mm;Andina 60;BLANCO;$;CLP;39000,00',
  '1007;Andina;Perfil · Palillo;AN300-BL;Travesaño 80 mm;Andina 60;BLANCO;$;CLP;24000,00',
  '1008;Andina;Perfil · Junquillo;AN400-BL;Junquillo 20 mm termopanel 18-22;Andina 60;BLANCO;$;CLP;5000,00',
  '1009;Andina;Perfil · Refuerzo;AR10;Refuerzo acero para AN100 1,5 mm X 5,8;Andina 60;;$;CLP;9000,00',
  '1010;Andina;Perfil · Marco;AN500-BL;Marco corredera 2 rieles;Andina Corredera 70;BLANCO;$;CLP;28000,00',
  '1011;Andina;Perfil · Hoja;AN510-BL;Hoja corredera 82 mm;Andina Corredera 70;BLANCO;$;CLP;31000,00',
  '1012;Andina;Perfil · Traslapo;AN520-BL;Traslapo central;Andina Corredera 70;BLANCO;$;CLP;9000,00',
  '1013;Andina;Perfil · Unión;AN900-BL;Acople entre marcos;;BLANCO;$;CLP;7000,00',
  '1014;Andina;Perfil · Marco;AN999-BL;Marco antiguo ** NO USAR **;;BLANCO;$;CLP;1000,00',
  '1015;Andina;Perfil · Hoja;AN600-BL;Hoja sin precio;Andina 60;BLANCO;$;CLP;1,00',
  '1016;Andina;Vidrio · Vidrio;VIDRIO;Tamaño de Vidrios Andina;;;$;CLP;1,00',
  '1020;Andina;Herraje · Herraje;H-C1;Cremona abatir E15 400-600;;;$;CLP;3000,00',
  '1021;Andina;Herraje · Herraje;H-C2;Cremona abatir E15 600-800;;;$;CLP;3300,00',
  '1022;Andina;Herraje · Herraje;H-C3;Cremona abatir E15 800-1000;;;$;CLP;3600,00',
  '1023;Andina;Herraje · Herraje;H-B1;Bisagra 2D blanca;;;$;CLP;1500,00',
  '1024;Andina;Herraje · Herraje;H-M1;Manilla ventana blanca;;;$;CLP;2200,00',
  '1025;Andina;Herraje · Herraje;H-K1;Carro doble corredera 80 kg;;;$;CLP;1800,00',
  '1026;Andina;Herraje · Hoja;H-T1;Tornillo autoperforante 3,9 X 19 caja 1000;;;$;CLP;15000,00',
  '1027;Andina;Accesorios · Accesorios;H-P1;"Tapa batiente ""clásica"" (par)";;;$;CLP;600,00',
  '1028;Andina;Instalación;H-S1;Silicona neutra blanca 300 ml;;;$;CLP;3200,00',
]

const GLASS_ROWS = [
  '2001;Vidrios Demo;Vidrio · Vidrio;V-4;Cristal Incoloro 4mm;;;$;CLP;14000,00',
  '2002;Vidrios Demo;Vidrio · V.DVH;;DVH  4+12+ 4;;;$;CLP;31000,00',
  '2003;Vidrios Demo;Vidrio;;Laminado Inc. 6.38mm;;;$;CLP;33000,00',
  '2004;Vidrios Demo;Vidrio;;DVH 5+12+5 ** NO USAR **;;;$;CLP;40000,00',
  '2005;Vidrios Demo;Vidrio;;DVH 6+12+6;;;$;CLP;11,00',
  '2006;Vidrios Demo;Vidrio · V.Separador;SEP12;Separador 12 mm aluminio;;;$;CLP;900,00',
]

/** Proline sintético mínimo para comprobar los datos verificados (descripciones inventadas). */
const PROLINE_ROWS = [
  '3001;Proline;Perfil · Marco;101300001;MARCO PRUEBA 60/64 PRO01 X 5.8;PRO6004;BLANCO;$;CLP;20000,00',
  '3002;Proline;Perfil · Marco;101500001;MARCO PRUEBA 60/64 BLANCO PRO01 X 5.8;;NOGAL;$;CLP;30000,00',
  '3003;Proline;Perfil · Hoja;101300521;HOJA PRUEBA EXT. 80MM PRO521 X 5.8;;BLANCO;$;CLP;25000,00',
  '3004;Proline;Perfil · Hoja;101300002;HOJA PRUEBA INT. 80MM PRO02 X 5.8;;BLANCO;$;CLP;25500,00',
  '3005;Proline;Perfil · Palillo;101300003;TRAVESAÑO PRUEBA 80MM PRO03 X 5.8;;BLANCO;$;CLP;22000,00',
  '3006;Proline;Perfil · Junquillo;101300005;JUNQUILLO 19/20-22 PRUEBA PRO05 X 5.8;;BLANCO;$;CLP;5000,00',
  '3007;Proline;Perfil · Refuerzo;110800050;REF. PRUEBA PRO-R1 28X25X28 X 5.8M;;;$;CLP;9000,00',
]

export const ANDINA_PRODUCTS = [
  { id: '9001', tipo: '(V)', nombre: 'Ventana abatir exterior (Ma:an100 Ho:an200)', descuento_marco: '45.0', ancho_hoja: '78.0', descuento_hoja: '58.0', avisos: [], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Abatir Exterior' },
  { id: '9002', tipo: '(V)', nombre: 'Ventana proyectante', descuento_marco: '45.0', ancho_hoja: '78.0', descuento_hoja: '58.0', avisos: [], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Proyectante' },
  { id: '9003', tipo: '(V)', nombre: 'Paño fijo', descuento_marco: '45.0', ancho_hoja: '0.0', descuento_hoja: '0.0', avisos: [], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Fijo' },
  { id: '9004', tipo: '(V)', nombre: 'Marco alternativo', descuento_marco: '50.0', ancho_hoja: '78.0', descuento_hoja: '58.0', avisos: ['El descuento de marco (50) no coincide con el perfil marco 1001 (45).'], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Oscilobatiente' },
  { id: '9005', tipo: '(P)', nombre: 'Puerta exterior', descuento_marco: '45.0', ancho_hoja: '108.0', descuento_hoja: '88.0', avisos: [], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Puerta Abatir EXTERIOR' },
  { id: '9006', tipo: '(M)', nombre: 'Vano vacío', descuento_marco: '0.0', ancho_hoja: '0.0', descuento_hoja: '0.0', avisos: [], marcado_con_error: false, linea: 'Andina 60', tipologia: 'Vano' },
  { id: '9010', tipo: '(V)', nombre: 'Corredera 2 hojas', descuento_marco: '50.0', ancho_hoja: '82.0', descuento_hoja: '62.0', avisos: [], marcado_con_error: false, linea: 'Andina Corredera 70', tipologia: 'Corredera 2 Hojas Doble Riel' },
  { id: '9011', tipo: '(V)', nombre: 'Corredera 3 hojas', descuento_marco: '50.0', ancho_hoja: '82.0', descuento_hoja: '62.0', avisos: [], marcado_con_error: false, linea: 'Andina Corredera 70', tipologia: 'Corredera 3 Hojas Dobre Riel 2Fijos' },
  { id: '9012', tipo: '(V Asim HOR)', nombre: 'Corredera 1 hoja fija', descuento_marco: '50.0', ancho_hoja: '82.0', descuento_hoja: '62.0', avisos: [], marcado_con_error: false, linea: 'Andina Corredera 70', tipologia: 'Corredera 2 Hojas Doble Riel 1HF' },
]

function ficha(product: (typeof ANDINA_PRODUCTS)[number], brand: string) {
  const campo = (nombre: string, valor: string) => ({ nombre, etiqueta: nombre, tipo: 'text', valor, marcado: null })
  return {
    url: '',
    titulo: product.nombre.toUpperCase(),
    campos: [
      campo('nombre', product.nombre),
      campo('idFabrica', brand),
      campo('idLinea', product.linea),
      campo('tipoAbertura', product.tipo.startsWith('(P') ? 'Puerta' : product.tipo.startsWith('(M') ? 'Marco' : 'Ventana'),
      campo('idTipologia', product.tipologia),
    ],
    tablas: [],
    texto: '',
  }
}

/** Crea una carpeta temporal con listas de precios y pautas inventadas. Devuelve su ruta. */
export function createSyntheticSource(): string {
  const root = mkdtempSync(join(tmpdir(), 'framezen-catalog-'))
  const items = join(root, 'items')
  mkdirSync(items, { recursive: true })
  writeFileSync(join(items, 'MisPrecios_15012026_0900.csv'), csv(ANDINA_ROWS))
  writeFileSync(join(items, 'MisPrecios_15012026_0901.csv'), csv(GLASS_ROWS))
  writeFileSync(join(items, 'MisPrecios_15012026_0902.csv'), csv(PROLINE_ROWS))
  // Copia idéntica: debe detectarse y omitirse.
  writeFileSync(join(items, 'MisPrecios_15012026_0900 (1).csv'), csv(ANDINA_ROWS))

  const designs = join(root, 'marcas diseños y medidas')
  const andina = join(designs, 'Andina')
  mkdirSync(join(andina, 'fichas'), { recursive: true })
  writeFileSync(join(andina, 'marca.json'), JSON.stringify({ nombre: 'Andina', logo: null }))
  writeFileSync(join(andina, 'lineas.json'), JSON.stringify([
    { id: '1', nombre: 'ANDINA 60' },
    { id: '2', nombre: 'ANDINA CORREDERA 70' },
    { id: '3', nombre: 'ANDINA VIEJA ** DISCONTINUA **' },
  ]))
  writeFileSync(
    join(andina, 'productos.json'),
    JSON.stringify(ANDINA_PRODUCTS.map(({ linea: _linea, tipologia: _tipologia, ...product }) => ({ ...product, perfiles: [], alertas: [] }))),
  )
  for (const product of ANDINA_PRODUCTS) writeFileSync(join(andina, 'fichas', `${product.id}.json`), JSON.stringify(ficha(product, 'Andina')))

  const proline = join(designs, 'Proline')
  mkdirSync(join(proline, 'fichas'), { recursive: true })
  writeFileSync(join(proline, 'marca.json'), JSON.stringify({ nombre: 'Proline' }))
  writeFileSync(join(proline, 'lineas.json'), JSON.stringify([{ id: '7', nombre: 'PRO6004' }]))
  const prolineProduct = { id: '9100', tipo: '(V)', nombre: 'Ventana de prueba', descuento_marco: '44.0', ancho_hoja: '80.0', descuento_hoja: '60.0', avisos: [], marcado_con_error: false, linea: 'PRO6004', tipologia: 'Abatir Interior' }
  writeFileSync(join(proline, 'productos.json'), JSON.stringify([prolineProduct]))
  writeFileSync(join(proline, 'fichas', '9100.json'), JSON.stringify(ficha(prolineProduct, 'Proline')))
  return root
}

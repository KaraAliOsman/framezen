import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createAssembly, createDesign, TYPOLOGIES, type Catalog, type TypologyId } from '@dekopen/engine'
import { useEffect, useMemo, useState } from 'react'
import { lineFor } from './showcaseData'
import type { Viewer3DView } from './types'
import { Window3D } from './Window3D'

/**
 * Banco de capturas del visor (/dev/tresd, solo en desarrollo). Todo por la URL, para fotografiar cada
 * combinación sin clics: `?t=casement&c=blanco&ci=&v=interior&o=0.6&theme=dark&glass=dvh-4-12-4&a=bay`.
 * `window.__ar(formato)` exporta lo que se ve y devuelve tamaños, para medir el AR sin teléfono.
 */
const catalog = SAMPLE_CATALOG as unknown as Catalog

export default function TresdDevPage() {
  const params = new URLSearchParams(window.location.search)
  const typologyId = (params.get('t') ?? 'casement') as TypologyId
  const colorId = params.get('c') ?? 'blanco'
  const colorInId = params.get('ci') ?? undefined
  const view = (params.get('v') ?? 'interior') as Viewer3DView
  const open = params.has('o') ? Number(params.get('o')) : undefined
  const theme = params.get('theme') ?? 'light'
  const glassId = params.get('glass') ?? 'dvh-4-12-4'
  const assemblyId = params.get('a')
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    setDrawn(true)
  }, [theme])

  const { design, layout } = useMemo(() => {
    if (assemblyId) {
      const line = catalog.lines.find((item) => item.kind === 'casement') ?? catalog.lines[0]
      const assembled = createAssembly(assemblyId, { lineId: line.id, colorId, glassId }, catalog)
      if (colorInId) assembled.colorInId = colorInId
      return { design: assembled, layout: computeLayout(assembled, catalog) }
    }
    const line = lineFor(catalog, typologyId)
    const single = createDesign(typologyId, { lineId: line?.id ?? '', colorId, glassId })
    if (colorInId) single.colorInId = colorInId
    return { design: single, layout: computeLayout(single, catalog) }
  }, [assemblyId, typologyId, colorId, colorInId, glassId])

  useEffect(() => {
    // Vuelve a leer lo exportado con los cargadores de three y lo dibuja: prueba de ida y vuelta sin teléfono.
    ;(window as unknown as { __arRead: unknown }).__arRead = async (format: 'glb' | 'usdz') => {
      const three = await import('three')
      const { exportForAR } = await import('./ar/export')
      const asset = await exportForAR({ layout, design, catalog }, format)
      const buffer = await asset.blob.arrayBuffer()
      let object: import('three').Object3D
      if (format === 'glb') {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        object = (await new GLTFLoader().parseAsync(buffer, '')).scene
      } else {
        const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js')
        object = new USDLoader().parse(buffer)
      }
      const box = new three.Box3().setFromObject(object)
      const size = box.getSize(new three.Vector3())
      const textures = new Set<string>()
      let meshes = 0
      object.traverse((item) => {
        if (item instanceof three.Mesh) meshes++
      })
      // El lector de USD decodifica sus imágenes aparte: se les da un momento antes de dibujar.
      await new Promise((resolve) => setTimeout(resolve, 900))
      object.traverse((item) => {
        if (item instanceof three.Mesh) {
          const material = item.material as import('three').MeshStandardMaterial
          const image = material.map?.image as { width: number; height: number } | undefined
          if (image) textures.add(`${image.width}x${image.height}`)
        }
      })
      const canvas = document.createElement('canvas')
      canvas.width = 560
      canvas.height = 560
      canvas.style.cssText = 'position:fixed;inset:0;z-index:9;background:#7C8A92'
      document.body.append(canvas)
      const renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: true })
      const scene = new three.Scene()
      scene.add(new three.HemisphereLight('#ffffff', '#777777', 2.2), object)
      const light = new three.DirectionalLight('#ffffff', 2)
      light.position.set(-1, 2, 2)
      scene.add(light)
      const center = box.getCenter(new three.Vector3())
      const camera = new three.PerspectiveCamera(30, 1, 0.01, 50)
      camera.position.set(center.x + 1.2, center.y + 0.3, center.z + Math.max(size.x, size.y) * 2.4)
      camera.lookAt(center)
      renderer.render(scene, camera)
      return { size: size.toArray(), meshes, textures: [...textures] }
    }
    ;(window as unknown as { __ar: unknown }).__ar = async (format: 'glb' | 'usdz') => {
      const { exportForAR } = await import('./ar/export')
      const started = performance.now()
      const asset = await exportForAR({ layout, design, catalog }, format)
      const buffer = new Uint8Array(await asset.blob.arrayBuffer())
      return {
        ms: Math.round(performance.now() - started),
        bytes: asset.blob.size,
        triangles: asset.triangles,
        materials: asset.materials,
        size: asset.size,
        base64: btoa(Array.from(buffer, (byte) => String.fromCharCode(byte)).join('')),
      }
    }
  }, [layout, design])

  if (!TYPOLOGIES.some((item) => item.id === typologyId)) return <p>Tipología desconocida</p>
  return drawn ? <Window3D layout={layout} design={design} catalog={catalog} openAmount={open} view={view} height="100dvh" /> : null
}

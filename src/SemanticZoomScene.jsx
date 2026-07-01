import { useRef, useState, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ScrollControls, useScroll, Html, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { easing } from 'maath'

// ── Camera path ───────────────────────────────────────────────────────────────
const CAMERA_OUT = new THREE.Vector3(16, 13, 16)
const CAMERA_IN  = new THREE.Vector3(3.4, 1.6, 4.2)
const LOOK_OUT   = new THREE.Vector3(0, 2, 0)
const LOOK_IN    = new THREE.Vector3(4, 1.4, 3)

// ── Stage definitions with annotation + GLTF hook ────────────────────────────
const STAGES = [
  {
    id: 1, name: 'Facade', color: '#8a8a86',
    in: [0, 0], out: [0.05, 0.25],
    label: 'Building Skin',
    desc: 'Outer envelope · weatherproofing + solar control layer',
    clickTarget: 0.0,
    labelPos: [0, 5, 0],
    gltfUrl: null,   // → swap to '/models/stage_facade.glb' when ready
  },
  {
    id: 2, name: 'Structure', color: '#c8a96e',
    in: [0, 0.1], out: [0.55, 0.75],
    label: 'Structural Frame',
    desc: 'Exposed concrete grid · 5 m module · 6 floors',
    clickTarget: 0.2,
    labelPos: [0, 5, 0],
    gltfUrl: null,
  },
  {
    id: 3, name: 'Volumes', color: '#1d9e75',
    in: [0.15, 0.3], out: [0.7, 0.85],
    label: 'Programme Volumes',
    desc: '3 primary bays · residential / co-working / public',
    clickTarget: 0.45,
    labelPos: [-2.5, 4, 0],
    gltfUrl: null,
  },
  {
    id: 4, name: 'Room Shell', color: '#d85a30',
    in: [0.35, 0.5], out: [0.85, 0.95],
    label: 'Hero Room Shell',
    desc: 'Kitchen unit shell · 3 m × 2.6 m × 3 m volume',
    clickTarget: 0.65,
    labelPos: [4, 3, 3],
    gltfUrl: null,
  },
  {
    id: 5, name: 'Kitchen Detail', color: '#ba7517',
    in: [0.65, 0.85], out: [1, 1],
    label: 'Interior Detail',
    desc: 'Counter slab · 2.2 m · wall cabinet · recessed lighting',
    clickTarget: 0.9,
    labelPos: [4, 2.4, 3],
    gltfUrl: null,
  },
]

// ── Shared frame state (updated inside Canvas, read by overlay outside) ───────
const frameState = { offset: 0, activeStage: 0 }

// ── Utilities ─────────────────────────────────────────────────────────────────
function bandOpacity(offset, [inStart, inEnd], [outStart, outEnd]) {
  const fadeIn  = THREE.MathUtils.smoothstep(offset, inStart, Math.max(inEnd,  inStart  + 0.001))
  const fadeOut = 1 - THREE.MathUtils.smoothstep(offset, outStart, Math.max(outEnd, outStart + 0.001))
  return Math.min(fadeIn, fadeOut)
}

function scrollToOffset(el, offset, pages) {
  if (!el) return
  el.scrollTop = offset * el.scrollHeight * ((pages - 1) / pages)
}

// ── GLTF model loader (used only when gltfUrl is set) ────────────────────────
function GLTFModel({ url, opacity, color }) {
  const { scene } = useGLTF(url)
  const cloned = useRef()

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh) {
        child.material = child.material.clone()
        child.material.transparent = true
        child.material.opacity = opacity
        if (color) child.material.color.set(color)
      }
    })
  }, [scene, opacity, color])

  return <primitive ref={cloned} object={scene} />
}

// ── Placeholder geometry per stage ────────────────────────────────────────────
function PlaceholderMesh({ stage, matRef, onClick }) {
  const handleClick = (e) => { e.stopPropagation(); onClick() }

  if (stage.id === 1) return (
    <mesh onClick={handleClick}>
      <boxGeometry args={[10, 8, 10]} />
      <meshStandardMaterial ref={matRef} color={stage.color} transparent opacity={0} />
    </mesh>
  )

  if (stage.id === 2) return (
    <mesh onClick={handleClick}>
      <boxGeometry args={[10, 8, 10]} />
      <meshBasicMaterial ref={matRef} color={stage.color} wireframe transparent opacity={0} />
    </mesh>
  )

  if (stage.id === 3) return (
    <group onClick={handleClick}>
      {[-2.5, 0, 2.5].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <boxGeometry args={[1.6, 6, 6]} />
          <meshStandardMaterial
            ref={el => { if (matRef) matRef.current = el }}
            color={stage.color} transparent opacity={0}
          />
        </mesh>
      ))}
    </group>
  )

  if (stage.id === 4) return (
    <mesh position={[4, 1, 3]} onClick={handleClick}>
      <boxGeometry args={[3, 2.6, 3]} />
      <meshStandardMaterial ref={matRef} color={stage.color} transparent opacity={0} />
    </mesh>
  )

  if (stage.id === 5) return (
    <group position={[4, 0, 3]} onClick={handleClick}>
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[2.2, 0.9, 0.6]} />
        <meshStandardMaterial ref={el => { if (matRef) matRef.current = el }} color={stage.color} transparent opacity={0} />
      </mesh>
      <mesh position={[0, 1, -1]}>
        <boxGeometry args={[2.2, 1.2, 0.1]} />
        <meshStandardMaterial color="#e8e3d8" transparent opacity={0} />
      </mesh>
    </group>
  )

  return null
}

// ── One LOD stage: geometry + HTML label + scroll-driven opacity ──────────────
function Stage({ stage }) {
  const scroll    = useScroll()
  const groupRef  = useRef()
  const matRef    = useRef()
  const opRef     = useRef(0)

  const handleClick = () => {
    scrollToOffset(scroll.el, stage.clickTarget, 3)
  }

  useFrame((_, delta) => {
    const target = bandOpacity(scroll.offset, stage.in, stage.out)
    opRef.current = THREE.MathUtils.lerp(opRef.current, target, 1 - Math.pow(0.03, delta))

    if (matRef.current) {
      easing.damp(matRef.current, 'opacity', target, 0.25, delta)
    }

    if (groupRef.current) groupRef.current.visible = opRef.current > 0.01
  })

  return (
    <group ref={groupRef}>
      {/* Geometry: GLTF if available, else placeholder */}
      {stage.gltfUrl ? (
        <Suspense fallback={<PlaceholderMesh stage={stage} matRef={matRef} onClick={handleClick} />}>
          <GLTFModel url={stage.gltfUrl} opacity={opRef.current} color={stage.color} />
        </Suspense>
      ) : (
        <PlaceholderMesh stage={stage} matRef={matRef} onClick={handleClick} />
      )}

      {/* Floating label — fades with the stage */}
      <Html
        position={stage.labelPos}
        center
        zIndexRange={[5, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <StageLabel stage={stage} opRef={opRef} />
      </Html>
    </group>
  )
}

// ── HTML label rendered inside drei Html (world-space, inside Canvas) ─────────
function StageLabel({ stage, opRef }) {
  const [op, setOp] = useState(0)
  useEffect(() => {
    let raf
    const tick = () => { setOp(opRef.current); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [opRef])

  return (
    <div className="szs-label" style={{ opacity: op, transform: `translateY(${(1 - op) * 8}px)` }}>
      <div className="szs-label-name">{stage.label}</div>
      <div className="szs-label-desc">{stage.desc}</div>
    </div>
  )
}

// ── Camera rig ────────────────────────────────────────────────────────────────
function RigCamera() {
  const { camera } = useThree()
  const scroll      = useScroll()
  const lookTarget  = useRef(LOOK_OUT.clone())

  useFrame((_, delta) => {
    const offset     = scroll.offset
    const targetPos  = CAMERA_OUT.clone().lerp(CAMERA_IN,  offset)
    const targetLook = LOOK_OUT.clone().lerp(LOOK_IN, offset)

    easing.damp3(camera.position, targetPos,       0.4, delta)
    easing.damp3(lookTarget.current, targetLook,   0.4, delta)
    camera.lookAt(lookTarget.current)
  })

  return null
}

// ── Scroll tracker: writes into frameState so the overlay can read it ─────────
function ScrollTracker() {
  const scroll = useScroll()

  useFrame(() => {
    frameState.offset = scroll.offset
    let best = 0, bestOp = 0
    STAGES.forEach(s => {
      const op = bandOpacity(scroll.offset, s.in, s.out)
      if (op > bestOp) { bestOp = op; best = s.id }
    })
    frameState.activeStage = best
  })

  return null
}

// ── Scene content (inside Canvas / ScrollControls) ────────────────────────────
function SceneContent() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[8, 12, 6]} intensity={1.1} />
      <RigCamera />
      <ScrollTracker />
      {STAGES.map(s => <Stage key={s.id} stage={s} />)}
    </>
  )
}

// ── Stage dot nav (progress dots) ────────────────────────────────────────────
function StageDots({ activeStage, offset }) {
  return (
    <div className="szs-dots">
      {STAGES.map(s => (
        <div
          key={s.id}
          className={`szs-dot${activeStage === s.id ? ' active' : ''}`}
          title={s.label}
        />
      ))}
    </div>
  )
}

// ── Overlay HUD (outside Canvas) ──────────────────────────────────────────────
function SceneOverlay({ onClose }) {
  const [offset,      setOffset]      = useState(0)
  const [activeStage, setActiveStage] = useState(0)

  // Poll frameState at 20fps — low enough to avoid jank
  useEffect(() => {
    const id = setInterval(() => {
      setOffset(frameState.offset)
      setActiveStage(frameState.activeStage)
    }, 50)
    return () => clearInterval(id)
  }, [])

  const stage = STAGES.find(s => s.id === activeStage)
  const pct   = Math.round(offset * 100)

  return (
    <>
      {/* Top bar */}
      <div className="szs-topbar">
        <div className="szs-brand">EXHIBITION</div>
        <div className="szs-stage-name">
          {stage ? `${String(stage.id).padStart(2, '0')} · ${stage.name.toUpperCase()}` : '——'}
        </div>
        <button className="szs-close" onClick={onClose} title="Back to main app">✕</button>
      </div>

      {/* Bottom progress bar */}
      <div className="szs-progressbar">
        <div className="szs-bar-track">
          <div className="szs-bar-fill" style={{ width: `${pct}%` }} />
          {STAGES.map(s => (
            <div
              key={s.id}
              className={`szs-bar-dot${s.id === activeStage ? ' active' : ''}`}
              style={{ left: `${s.clickTarget * 100}%` }}
              title={s.label}
            />
          ))}
        </div>
        <div className="szs-bar-pct">{pct}%</div>
      </div>

      {/* Room info panel — slides in for the last two stages */}
      <div className={`szs-info-panel${activeStage >= 4 ? ' visible' : ''}`}>
        {stage && activeStage >= 4 && (
          <>
            <div className="szs-info-label">{stage.label}</div>
            <div className="szs-info-desc">{stage.desc}</div>
            <div className="szs-info-hint">↑ Click mesh to focus · Scroll to navigate</div>
          </>
        )}
      </div>

      {/* Hint */}
      <div className="szs-hint">Scroll to zoom through the building · Click any layer to jump</div>
    </>
  )
}

// ── Root export ────────────────────────────────────────────────────────────────
export default function SemanticZoomScene({ onClose }) {
  return (
    <div className="szs-root">
      <Canvas camera={{ position: CAMERA_OUT.toArray(), fov: 35 }}>
        <ScrollControls pages={3} damping={0.25}>
          <SceneContent />
        </ScrollControls>
      </Canvas>

      <SceneOverlay onClose={onClose} />
    </div>
  )
}

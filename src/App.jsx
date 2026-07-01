import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, OrthographicCamera, Center, Html } from '@react-three/drei'
import * as THREE from 'three'
import SemanticZoomScene from './SemanticZoomScene.jsx'

// ── geometry helpers ──────────────────────────────────────────────────────────
function buildGeometry(part) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3))
  g.setIndex(part.indices)
  g.computeVertexNormals()
  return g
}

const toColor = (c) => new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255)

// floor layer names as received from the model
const FLOOR_LAYER_KEYS = new Set(['Floor G', 'floor 1', 'floor 2', 'floor 3', 'floor 4', 'floor 5'])

// ── colour presets ────────────────────────────────────────────────────────────
const VIEWER_STYLES = {
  arctic: { label: 'Arctic', modelOpacity: 0.32, colorOverride: '#c8dce8', glowFill: '#0d3a5c', glowEdge: '#1e6fa8' },
  neon:   { label: 'Neon',   modelOpacity: 0.32, colorOverride: '#c8dce8', glowFill: '#7c1fa8', glowEdge: '#f472b6' },
}

const EDITOR_SCHEMES = {
  cyber:  { label: 'Cyber',   avail: '#4CC9F0', sel: '#FFE600', booked: '#1a5c40', bookedEdge: '#4cc9a0', stayAvail: '#c87941', stayAvailEdge: '#e8893a' },
  warm:   { label: 'Warm',    avail: '#ff9a3c', sel: '#FFE600', booked: '#5c3a1a', bookedEdge: '#c9804c', stayAvail: '#e8505b', stayAvailEdge: '#ff8a80' },
  plasma: { label: 'Plasma',  avail: '#a855f7', sel: '#e040fb', booked: '#3d1a5c', bookedEdge: '#9b64c9', stayAvail: '#7c3aed', stayAvailEdge: '#c084fc' },
  mono:   { label: 'Mono',    avail: '#888888', sel: '#ffffff', booked: '#333333', bookedEdge: '#aaaaaa', stayAvail: '#666666', stayAvailEdge: '#999999' },
  arctic: { label: 'Arctic',  avail: '#7dd3fc', sel: '#bae6fd', booked: '#1e4a6a', bookedEdge: '#38bdf8', stayAvail: '#5e9ab5', stayAvailEdge: '#7dd3fc' },
}

// ── per-layer mesh ────────────────────────────────────────────────────────────
function LayerMesh({ part, mode, hovered, onHover, opacityMod = 1, colorOverride = null }) {
  const geo       = useMemo(() => buildGeometry(part), [part])
  const baseColor = useMemo(
    () => colorOverride ? new THREE.Color(colorOverride) : toColor(part.color),
    [part, colorOverride]
  )
  const finalOpacity = part.opacity * opacityMod

  return (
    <mesh
      geometry={geo}
      castShadow
      receiveShadow
      onPointerOver={(e) => { e.stopPropagation(); onHover(part.layer) }}
      onPointerOut={() => onHover(null)}
    >
      <meshStandardMaterial
        color={baseColor}
        transparent={finalOpacity < 1}
        opacity={finalOpacity}
        roughness={0.65}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

// ── scene ─────────────────────────────────────────────────────────────────────
function Model({ data, visible, activeFloor, focusLayers, mode, hovered, onHover, viewerOpacity = 1, colorOverride = null }) {
  const activeFloorIdx = activeFloor ? BKG_FLOOR_KEYS.indexOf(activeFloor) : -1

  return (
    <Center>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {data.statics
          .filter((p) => {
            if (FLOOR_LAYER_KEYS.has(p.layer)) return true
            return visible[p.layer] !== false
          })
          .map((p, i) => {
            let opacityMod = 1

            if (mode === 'viewer') {
              // ghost the entire building; booked glow comes from ViewerBookedGlow
              opacityMod = viewerOpacity
            } else if (activeFloor) {
              if (FLOOR_LAYER_KEYS.has(p.layer)) {
                opacityMod = p.layer === activeFloor ? 1 : 0.07
              } else if (p.floor != null) {
                opacityMod = p.floor === activeFloorIdx ? 1 : 0.07
              } else {
                opacityMod = 0.15
              }
            } else if (focusLayers) {
              opacityMod = focusLayers.includes(p.layer) ? 1 : 0.05
            }

            return (
              <LayerMesh
                key={i}
                part={p}
                mode={mode}
                hovered={hovered}
                onHover={onHover}
                opacityMod={opacityMod}
                colorOverride={mode === 'viewer' ? colorOverride : null}
              />
            )
          })}
      </group>
    </Center>
  )
}

// ── editor grid ───────────────────────────────────────────────────────────────
function EditorGrid() {
  return (
    <gridHelper
      args={[2000, 100, 0x172040, 0x1e2a4a]}
      position={[0, -1, 0]}
    />
  )
}

// ── cameras + controls ────────────────────────────────────────────────────────
// key is set on this component externally so that switching mode/viewMode
// forces a full remount — ensuring OrbitControls re-attaches to the new camera.
function SceneCamera({ mode, viewMode }) {
  // plan view — shared by editor and viewer
  if (viewMode === 'plan') {
    return (
      <>
        <OrthographicCamera
          makeDefault
          position={[0, 800, 0.01]}
          up={[0, 0, -1]}
          zoom={12}
          near={0.1}
          far={8000}
        />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableRotate={false}
          enablePan
          enableZoom
          zoomSpeed={1.2}
        />
      </>
    )
  }

  // iso / catalogue view — shared by editor and viewer
  if (viewMode === 'iso' || viewMode === 'catalogue') {
    return (
      <>
        <OrthographicCamera
          makeDefault
          position={[-55, 45, 55]}
          zoom={10}
          near={0.1}
          far={8000}
        />
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enablePan
          enableZoom
          enableRotate
          zoomSpeed={1.2}
          minDistance={50}
          maxDistance={4000}
        />
      </>
    )
  }

  // viewer perspective — free-roam camera
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[50, 30, 70]}
        fov={50}
        near={0.5}
        far={5000}
      />
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        minDistance={10}
        maxDistance={3000}
        enablePan
      />
    </>
  )
}

// ── booking: constants ────────────────────────────────────────────────────────
// Real floor footprint 45.38 × 30.18 m → 9 cols × 6 rows at 5 m/cell
const BKG_KEY  = 'wolfsburg_deployable_bookings'
const BKG_ROWS = 6    // 6 × 5 m = 30 m depth
const BKG_COLS = 9    // 9 × 5 m = 45 m width
const BKG_M    = 5    // metres per cell
const BKG_SQM  = BKG_M * BKG_M  // 25 m² per cell

// Model bbox centre in three.js space (computed from all geometry positions):
// Rotation [-π/2,0,0]: (rhinoX, rhinoZ, -rhinoY)
// Full model bounds → cx=788, cy=10.43, cz=5
const BKG_CX = 788.0, BKG_CY = 10.43, BKG_CZ = 5.0
const BKG_FLOOR_RHOZ  = [0, 3.2, 6.4, 9.6, 12.8, 16.1]  // Rhino Z of each slab
const BKG_FLOOR_MIN_X = 765.3   // Rhino X left edge of building
const BKG_FLOOR_MIN_Y = -20.2   // Rhino Y bottom edge of building

// Return centred three.js position for cell centre (row, col) on given floor
function bkgPos(row, col, floorIdx) {
  const rhX = BKG_FLOOR_MIN_X + col * BKG_M + BKG_M / 2
  const rhY = BKG_FLOOR_MIN_Y + row * BKG_M + BKG_M / 2
  const rhZ = BKG_FLOOR_RHOZ[floorIdx]
  // After rotation: three.js (X, Y, Z) = (rhinoX, rhinoZ, -rhinoY)
  return [rhX - BKG_CX, rhZ - BKG_CY + 0.08, -rhY - BKG_CZ]
}

const FLOOR_H_M = 3.2  // floor-to-ceiling height in metres

// Build a subdivided BoxGeometry whose outer faces bow outward like an inflated cushion.
// inflation: 0-100. For h-walls the face normals are ±Z; for v-walls ±X.
function makeInflatableWallGeo(type, inflation) {
  const SEGS = 14
  const maxBulge = 0.55 * (inflation / 100)   // up to 55cm at full inflation
  const W = BKG_M, H = FLOOR_H_M, D = 0.14
  const geo = type === 'h'
    ? new THREE.BoxGeometry(W, H, D, SEGS, SEGS, 1)
    : new THREE.BoxGeometry(D, H, W, 1, SEGS, SEGS)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (type === 'h') {
      if (Math.abs(z) > D * 0.3) {
        const u = x / W + 0.5, v = y / H + 0.5
        const bulge = maxBulge * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)
        pos.setZ(i, Math.sign(z) * (D / 2 + bulge))
      }
    } else {
      if (Math.abs(x) > D * 0.3) {
        const u = z / W + 0.5, v = y / H + 0.5
        const bulge = maxBulge * Math.sin(u * Math.PI) * Math.sin(v * Math.PI)
        pos.setX(i, Math.sign(x) * (D / 2 + bulge))
      }
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

// Compute perimeter wall segments for a set of cell IDs on a given floor.
// Returns array of { id, pos, dir, side, geo } for each exterior edge.
function getPerimeterWalls(cells, floorIdx) {
  const cellSet = new Set(cells)
  const walls = []
  const added = new Set()
  cells.forEach(cellId => {
    const [r, c] = cellId.split('-').map(Number)
    const [cx, cy, cz] = bkgPos(r, c, floorIdx)
    const wy = cy + FLOOR_H_M / 2  // wall centre Y
    const edges = [
      { adj: `${r - 1}-${c}`, key: `H|${r}|${c}`,   side: 'top',    pos: [cx, wy, cz + BKG_M / 2], dir: [0, 0, 1],  geo: 'h' },
      { adj: `${r + 1}-${c}`, key: `H|${r + 1}|${c}`,side: 'bottom', pos: [cx, wy, cz - BKG_M / 2], dir: [0, 0, -1], geo: 'h' },
      { adj: `${r}-${c - 1}`, key: `V|${r}|${c}`,   side: 'left',   pos: [cx - BKG_M / 2, wy, cz], dir: [-1, 0, 0], geo: 'v' },
      { adj: `${r}-${c + 1}`, key: `V|${r}|${c + 1}`,side: 'right',  pos: [cx + BKG_M / 2, wy, cz], dir: [1, 0, 0],  geo: 'v' },
    ]
    edges.forEach(({ adj, key, side, pos, dir, geo }) => {
      if (!cellSet.has(adj) && !added.has(key)) {
        added.add(key)
        walls.push({ id: key, pos, dir, side, geo })
      }
    })
  })
  return walls
}

// Interior (shared) walls — the inverse of perimeter: walls between two adjacent selected cells
function getInteriorWalls(cells, floorIdx) {
  const cellSet = new Set(cells)
  const walls = []
  const added = new Set()
  cells.forEach(cellId => {
    const [r, c] = cellId.split('-').map(Number)
    const [cx, cy, cz] = bkgPos(r, c, floorIdx)
    const wy = cy + FLOOR_H_M / 2
    const edges = [
      { adj: `${r - 1}-${c}`, key: `IH|${r}|${c}`,    geo: 'h', pos: [cx, wy, cz + BKG_M / 2] },
      { adj: `${r + 1}-${c}`, key: `IH|${r + 1}|${c}`, geo: 'h', pos: [cx, wy, cz - BKG_M / 2] },
      { adj: `${r}-${c - 1}`, key: `IV|${r}|${c}`,    geo: 'v', pos: [cx - BKG_M / 2, wy, cz] },
      { adj: `${r}-${c + 1}`, key: `IV|${r}|${c + 1}`, geo: 'v', pos: [cx + BKG_M / 2, wy, cz] },
    ]
    edges.forEach(({ adj, key, geo, pos }) => {
      if (cellSet.has(adj) && !added.has(key)) {
        added.add(key)
        walls.push({ id: key, pos, geo })
      }
    })
  })
  return walls
}

const BKG_FLOORS = [
  { label: 'FG', name: 'Ground Floor',  z: '0 – 3.2 m'     },
  { label: 'F1', name: 'First Floor',   z: '3.2 – 6.4 m'   },
  { label: 'F2', name: 'Second Floor',  z: '6.4 – 9.6 m'   },
  { label: 'F3', name: 'Third Floor',   z: '9.6 – 12.8 m'  },
  { label: 'F4', name: 'Fourth Floor',  z: '12.8 – 16.1 m' },
  { label: 'F5', name: 'Fifth Floor',   z: '16.1 – 19.3 m' },
]
// maps booking floor index → model layer key (for floor isolation in catalogue)
const BKG_FLOOR_KEYS = ['Floor G', 'floor 1', 'floor 2', 'floor 3', 'floor 4', 'floor 5']

const BKG_ACTIVITIES = [
  'Stay Room','Co-working','Event / Performance','Play / Recreation','Retreat / Quiet Work',
  'Workshop / Making','Community Kitchen','Exhibition','Outdoor Extension',
]
const BKG_DURATIONS = ['1 day','3 days','1 week','2 weeks','1 month','Permanent (residents only)']
const BKG_ABBREV = {
  'Stay Room':'SR','Co-working':'CW','Event / Performance':'EV','Play / Recreation':'PL',
  'Retreat / Quiet Work':'RQ','Workshop / Making':'WS','Community Kitchen':'CK',
  'Exhibition':'EX','Outdoor Extension':'OE',
}

// Exact stayroom volumes from Rhino model (stayrooms layer, blue) — one entry per bookable room unit
// xmin/xmax/ymin/ymax in Rhino world coordinates, matched to BKG_FLOOR_RHOZ per floor
// Coordinates from Rhino layers: stayroom floor 1/2/3 (bounding box outer envelope)
const STAY_ROOMS = {
  1: [
    { id: 'f1-a', label: 'Room A', xmin: 794.31, xmax: 800.78, ymin: -10.60, ymax: -6.25  },
    { id: 'f1-b', label: 'Room B', xmin: 794.31, xmax: 800.78, ymin: -6.31,  ymax: -1.75  },
    { id: 'f1-c', label: 'Room C', xmin: 794.31, xmax: 803.08, ymin: -15.31, ymax: -10.55 },
    { id: 'f1-d', label: 'Room D', xmin: 775.68, xmax: 784.45, ymin: -15.31, ymax: -10.55 },
    { id: 'f1-e', label: 'Room E', xmin: 775.68, xmax: 780.48, ymin: -8.81,  ymax: -1.75  },
    { id: 'f1-f', label: 'Room F', xmin: 784.25, xmax: 792.61, ymin: -0.01,  ymax: 4.75   },
    { id: 'f1-g', label: 'Room G', xmin: 792.51, xmax: 797.31, ymin: -0.01,  ymax: 8.25   },
  ],
  2: [
    { id: 'f2-a', label: 'Room A', xmin: 775.52, xmax: 780.22, ymin: -10.55, ymax: -2.25  },
    { id: 'f2-b', label: 'Room B', xmin: 775.52, xmax: 784.19, ymin: -15.25, ymax: -10.55 },
    { id: 'f2-c', label: 'Room C', xmin: 794.15, xmax: 802.82, ymin: -15.25, ymax: -10.65 },
    { id: 'f2-d', label: 'Room D', xmin: 794.15, xmax: 800.52, ymin: -10.65, ymax: -1.75  },
    { id: 'f2-e', label: 'Room E', xmin: 792.45, xmax: 800.52, ymin: 0.05,   ymax: 4.75   },
    { id: 'f2-f', label: 'Room F', xmin: 784.19, xmax: 792.45, ymin: 0.05,   ymax: 4.75   },
  ],
  3: [
    { id: 'f3-a', label: 'Room A', xmin: 775.52, xmax: 780.22, ymin: -10.55, ymax: -2.25  },
    { id: 'f3-b', label: 'Room B', xmin: 775.52, xmax: 784.19, ymin: -15.25, ymax: -10.55 },
    { id: 'f3-c', label: 'Room C', xmin: 794.15, xmax: 800.52, ymin: -15.25, ymax: -10.65 },
    { id: 'f3-d', label: 'Room D', xmin: 794.15, xmax: 800.52, ymin: -10.65, ymax: -6.25  },
    { id: 'f3-e', label: 'Room E', xmin: 794.15, xmax: 802.82, ymin: -6.25,  ymax: -1.75  },
    { id: 'f3-f', label: 'Room F', xmin: 791.95, xmax: 800.52, ymin: 0.05,   ymax: 4.75   },
    { id: 'f3-g', label: 'Room G', xmin: 787.25, xmax: 791.95, ymin: 0.05,   ymax: 7.05   },
  ],
}
const STAY_ROOM_FLOOR_SET = new Set([1, 2, 3])
const srRoomById = (floor, id) => (STAY_ROOMS[floor] || []).find(r => r.id === id)

// localStorage helpers
const bkgLoad   = () => { try { return JSON.parse(localStorage.getItem(BKG_KEY) || '[]') } catch { return [] } }
const bkgSave   = (b) => { const a = bkgLoad(); a.push(b); localStorage.setItem(BKG_KEY, JSON.stringify(a)) }
const bkgUpdate = (b) => { localStorage.setItem(BKG_KEY, JSON.stringify(bkgLoad().map(x => x.id === b.id ? b : x))) }
const bkgCancel = (id) => { localStorage.setItem(BKG_KEY, JSON.stringify(bkgLoad().filter(b => b.id !== id))) }

// ── booking: 3D cells — generic floor grid (inside Canvas) ───────────────────
function BookingCells({ floor, sel, bookings, onToggle, scheme = 'cyber' }) {
  const sc = EDITOR_SCHEMES[scheme] || EDITOR_SCHEMES.cyber
  const planeGeo      = useMemo(() => new THREE.PlaneGeometry(BKG_M - 0.25, BKG_M - 0.25), [])
  const haloGeo       = useMemo(() => new THREE.PlaneGeometry(BKG_M + 1.4, BKG_M + 1.4), [])
  const edgeGeo       = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(BKG_M, BKG_M)), [])
  const bkdVolGeo     = useMemo(() => new THREE.BoxGeometry(BKG_M - 0.1, FLOOR_H_M, BKG_M - 0.1), [])
  const bkdEdgeGeo    = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BKG_M + 0.1, FLOOR_H_M + 0.1, BKG_M + 0.1)), [])
  const matEmpty      = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.avail,      transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }), [sc.avail])
  const matSel        = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.sel,        transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }), [sc.sel])
  const matHalo       = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.sel,        transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }), [sc.sel])
  const matBooked     = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.booked,     transparent: true, opacity: 0.30, depthWrite: false, side: THREE.DoubleSide }), [sc.booked])
  const matBookedEdge = useMemo(() => new THREE.LineBasicMaterial({ color: sc.bookedEdge, transparent: true, opacity: 0.70 }), [sc.bookedEdge])
  const matEdge       = useMemo(() => new THREE.LineBasicMaterial({ color: sc.avail,      transparent: true, opacity: 0.16 }), [sc.avail])
  const matEdgeSel    = useMemo(() => new THREE.LineBasicMaterial({ color: sc.sel,        transparent: true, opacity: 0.90 }), [sc.sel])

  useFrame(({ clock }) => {
    const t       = clock.getElapsedTime()
    const pulse   = 0.5 + 0.5 * Math.sin(t * 2.4)
    const avPulse = 0.5 + 0.5 * Math.sin(t * 1.6 + Math.PI)
    const bkdPulse = 0.5 + 0.5 * Math.sin(t * 1.1)
    matSel.opacity        = 0.30 + 0.50 * pulse
    matHalo.opacity       = 0.04 + 0.18 * pulse
    matEdgeSel.opacity    = 0.50 + 0.50 * pulse
    matEmpty.opacity      = 0.05 + 0.14 * avPulse
    matEdge.opacity       = 0.10 + 0.18 * avPulse
    matBooked.opacity     = 0.15 + 0.22 * bkdPulse
    matBookedEdge.opacity = 0.45 + 0.45 * bkdPulse
  })

  const bkdMap = {}
  bookings.filter(b => b.floor === floor).forEach(b => b.cells.forEach(c => bkdMap[c] = b))

  const cells = []
  for (let r = 0; r < BKG_ROWS; r++) {
    for (let c = 0; c < BKG_COLS; c++) {
      const id    = `${r}-${c}`
      const bkg   = bkdMap[id]
      const isSel = sel.has(id)
      const [px, py, pz] = bkgPos(r, c, floor)
      cells.push(
        <group key={id}>
          {/* flat floor indicator */}
          <group position={[px, py, pz]} rotation={[-Math.PI / 2, 0, 0]}>
            {isSel && <mesh geometry={haloGeo} material={matHalo} position={[0, 0, -0.01]} />}
            <mesh
              geometry={planeGeo}
              material={isSel ? matSel : matEmpty}
              onClick={(e) => { e.stopPropagation(); if (!bkg) onToggle(id) }}
            />
            <lineSegments geometry={edgeGeo} material={isSel ? matEdgeSel : matEdge} />
          </group>
          {/* booked: full-height 3D volume visible in iso */}
          {bkg && (
            <group position={[px, py + FLOOR_H_M / 2, pz]}>
              <mesh geometry={bkdVolGeo} material={matBooked}
                onClick={(e) => e.stopPropagation()} />
              <lineSegments geometry={bkdEdgeGeo} material={matBookedEdge} />
            </group>
          )}
        </group>
      )
    }
  }
  return <group>{cells}</group>
}

// ── booking: stayroom footprint shapes (inside Canvas) ───────────────────────
function roomThreePos(room, floor) {
  const rhX = (room.xmin + room.xmax) / 2
  const rhY = (room.ymin + room.ymax) / 2
  const rhZ = BKG_FLOOR_RHOZ[floor]
  return [rhX - BKG_CX, rhZ - BKG_CY + 0.08, -rhY - BKG_CZ]
}

// flat floor indicator (available / booked) — lives inside the rotated group
function RoomShape({ room, floor, isSel, isBooked, onToggle, matAvail, matBooked, matEdgeAvail, matEdgeBooked }) {
  const sx = room.xmax - room.xmin
  const sy = room.ymax - room.ymin
  const [px, py, pz] = roomThreePos(room, floor)
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(sx - 0.15, sy - 0.15), [sx, sy])
  const edgeGeo  = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(sx, sy)), [sx, sy])
  return (
    <group position={[px, py, pz]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh
        geometry={planeGeo}
        material={isBooked ? matBooked : matAvail}
        onClick={(e) => { e.stopPropagation(); if (!isBooked) onToggle(room.id) }}
      />
      <lineSegments geometry={edgeGeo} material={isBooked ? matEdgeBooked : matEdgeAvail} />
    </group>
  )
}

// glowing 3D selection cube — world-space, full floor height
function RoomSelectionCube({ room, floor, matBox, matEdge }) {
  const sx = room.xmax - room.xmin
  const sy = room.ymax - room.ymin
  const [px, py, pz] = roomThreePos(room, floor)
  const cy = py + FLOOR_H_M / 2
  const boxGeo  = useMemo(() => new THREE.BoxGeometry(sx - 0.08, FLOOR_H_M, sy - 0.08), [sx, sy])
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx + 0.06, FLOOR_H_M + 0.06, sy + 0.06)), [sx, sy])
  return (
    <group position={[px, cy, pz]}>
      <mesh geometry={boxGeo} material={matBox} />
      <lineSegments geometry={edgeGeo} material={matEdge} />
    </group>
  )
}

function BookedRoomVolume({ sx, sy, pos, matFill, matEdge }) {
  const boxGeo  = useMemo(() => new THREE.BoxGeometry(sx - 0.1, FLOOR_H_M, sy - 0.1), [sx, sy])
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(sx + 0.1, FLOOR_H_M + 0.1, sy + 0.1)), [sx, sy])
  return (
    <group position={pos}>
      <mesh geometry={boxGeo} material={matFill} />
      <lineSegments geometry={edgeGeo} material={matEdge} />
    </group>
  )
}

function StayRoomCells({ floor, sel, bookings, onToggle, scheme = 'cyber' }) {
  const sc = EDITOR_SCHEMES[scheme] || EDITOR_SCHEMES.cyber
  const rooms         = STAY_ROOMS[floor] || []
  const matAvail      = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.stayAvail,     transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), [sc.stayAvail])
  const matBooked     = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.booked,        transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }), [sc.booked])
  const matEdgeAvail  = useMemo(() => new THREE.LineBasicMaterial({ color: sc.stayAvailEdge, transparent: true, opacity: 0.55 }), [sc.stayAvailEdge])
  const matEdgeBooked = useMemo(() => new THREE.LineBasicMaterial({ color: sc.bookedEdge,    transparent: true, opacity: 0.70 }), [sc.bookedEdge])
  const matSelBox     = useMemo(() => new THREE.MeshBasicMaterial({ color: sc.sel,           transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }), [sc.sel])
  const matSelEdge    = useMemo(() => new THREE.LineBasicMaterial({ color: sc.sel,           transparent: true, opacity: 0.95 }), [sc.sel])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime()
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6)
    const slow  = 0.5 + 0.5 * Math.sin(t * 1.1)
    matSelBox.opacity    = 0.06 + 0.22 * pulse
    matSelEdge.opacity   = 0.55 + 0.45 * pulse
    matAvail.opacity     = 0.14 + 0.10 * slow
    matEdgeAvail.opacity = 0.35 + 0.25 * slow
    matBooked.opacity     = 0.12 + 0.20 * slow
    matEdgeBooked.opacity = 0.45 + 0.40 * slow
  })

  const bkdMap = {}
  bookings.filter(b => b.floor === floor).forEach(b => b.cells.forEach(c => bkdMap[c] = b))

  return (
    <group>
      {rooms.map(room => {
        const isSel    = sel.has(room.id)
        const isBooked = !!bkdMap[room.id]
        const sx = room.xmax - room.xmin
        const sy = room.ymax - room.ymin
        const [px, py, pz] = roomThreePos(room, floor)
        return (
          <group key={room.id}>
            {/* flat floor indicator */}
            <RoomShape
              room={room} floor={floor}
              isSel={isSel} isBooked={isBooked} onToggle={onToggle}
              matAvail={matAvail} matBooked={matAvail}
              matEdgeAvail={matEdgeAvail} matEdgeBooked={matEdgeAvail}
            />
            {/* booked: full-height 3D volume visible in iso */}
            {isBooked && <BookedRoomVolume
              sx={sx} sy={sy} pos={[px, py + FLOOR_H_M / 2, pz]}
              matFill={matBooked} matEdge={matEdgeBooked}
            />}
            {/* glowing full-height cube on selection */}
            {isSel && <RoomSelectionCube room={room} floor={floor} matBox={matSelBox} matEdge={matSelEdge} />}
          </group>
        )
      })}
    </group>
  )
}

// ── canvas capture helper (inside Canvas) ─────────────────────────────────────
function CanvasCapture({ captureRef }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    captureRef.current = {
      capture: (format) => {
        gl.render(scene, camera)
        return gl.domElement.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95)
      },
      camera,
    }
    return () => { captureRef.current = null }
  }, [gl, scene, camera, captureRef])
  return null
}

// ── viewer: glowing confirmed-booking cells (inside Canvas) ──────────────────
// Stayroom cells need per-room geometry (variable size) — a small sub-component
// lets useMemo run at component level instead of inside a map.
function GlowBox({ w, d, pos, matFill, matEdge }) {
  const boxGeo  = useMemo(() => new THREE.BoxGeometry(w - 0.1, FLOOR_H_M, d - 0.1), [w, d])
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.14, FLOOR_H_M + 0.14, d + 0.14)), [w, d])
  return (
    <group position={pos}>
      <mesh geometry={boxGeo} material={matFill} />
      <lineSegments geometry={edgeGeo} material={matEdge} />
    </group>
  )
}

function ViewerBookedGlow({ bookings, glowFill = '#4CC9F0', glowEdge = '#F72585' }) {
  const gridBoxGeo  = useMemo(() => new THREE.BoxGeometry(BKG_M - 0.1, FLOOR_H_M, BKG_M - 0.1), [])
  const gridEdgeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(BKG_M + 0.14, FLOOR_H_M + 0.14, BKG_M + 0.14)), [])
  const matFill = useMemo(() => new THREE.MeshBasicMaterial({ color: glowFill, transparent: true, opacity: 0.08, depthWrite: false, depthTest: false, side: THREE.DoubleSide }), [glowFill])
  const matEdge = useMemo(() => new THREE.LineBasicMaterial({ color: glowEdge, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }), [glowEdge])

  useFrame(({ clock }) => {
    const pulse     = 0.5 + 0.5 * Math.sin(clock.getElapsedTime() * 1.3)
    matFill.opacity = 0.30 + 0.55 * pulse   // 0.30 → 0.85 — dark colors stay readable
    matEdge.opacity = 0.55 + 0.45 * pulse   // 0.55 → 1.00
  })

  return (
    <group renderOrder={999}>
      {/* glowing cell volumes */}
      {bookings.flatMap(booking => {
        const floorIdx    = booking.floor
        const isStayRoom  = STAY_ROOM_FLOOR_SET.has(floorIdx)
        return booking.cells.map(cellId => {
          if (isStayRoom) {
            const room = srRoomById(floorIdx, cellId)
            if (!room) return null
            const w = room.xmax - room.xmin
            const d = room.ymax - room.ymin
            const [px, py, pz] = roomThreePos(room, floorIdx)
            return (
              <GlowBox
                key={`${booking.id}-${cellId}`}
                w={w} d={d}
                pos={[px, py + FLOOR_H_M / 2, pz]}
                matFill={matFill} matEdge={matEdge}
              />
            )
          } else {
            const [r, c] = cellId.split('-').map(Number)
            const [px, py, pz] = bkgPos(r, c, floorIdx)
            return (
              <group key={`${booking.id}-${cellId}`} position={[px, py + FLOOR_H_M / 2, pz]}>
                <mesh geometry={gridBoxGeo} material={matFill} />
                <lineSegments geometry={gridEdgeGeo} material={matEdge} />
              </group>
            )
          }
        })
      })}

      {/* floating name label — one per booking, centred above its cells */}
      {bookings.map(booking => {
        const floorIdx   = booking.floor
        const isStayRoom = STAY_ROOM_FLOOR_SET.has(floorIdx)
        const xs = [], zs = []
        for (const cellId of booking.cells) {
          if (isStayRoom) {
            const room = srRoomById(floorIdx, cellId)
            if (room) { const [px,,pz] = roomThreePos(room, floorIdx); xs.push(px); zs.push(pz) }
          } else {
            const [r, c] = cellId.split('-').map(Number)
            const [px,,pz] = bkgPos(r, c, floorIdx); xs.push(px); zs.push(pz)
          }
        }
        if (!xs.length) return null
        const cx  = xs.reduce((s, x) => s + x, 0) / xs.length
        const cz  = zs.reduce((s, z) => s + z, 0) / zs.length
        const cy  = bkgPos(0, 0, floorIdx)[1] + FLOOR_H_M + 2.5
        const floorLabel = BKG_FLOORS[floorIdx]?.label || `F${floorIdx}`
        const userName   = booking.userName || 'Booking'
        const activity   = booking.activity || ''
        return (
          <Html key={`lbl-${booking.id}`} position={[cx, cy, cz]} center zIndexRange={[10, 20]}>
            <div className="viewer-booking-label" style={{ '--gc': glowEdge }}>
              <span className="vbl-name">{userName}</span>
              {activity && <span className="vbl-act">{activity}</span>}
              <span className="vbl-floor">{floorLabel}</span>
            </div>
          </Html>
        )
      })}
    </group>
  )
}

// ── parametric roof mesh (inside Canvas) ─────────────────────────────────────
// GH mesh: 35m × 70m (26 × 51 vertices, 1.4m step). Z is height above base plane.
// Roof is scaled to fit booked cells' footprint and sits at the top of assembled walls.
function RoofMesh({ morphData, inflation, cells, floorIdx }) {
  const geometry = useMemo(() => {
    if (!morphData || !morphData.frames || morphData.frames.length < 2) return null
    const frames = morphData.frames
    const minP = frames[0].pressure
    const maxP = frames[frames.length - 1].pressure
    const p = minP + (inflation / 100) * (maxP - minP)

    let f0 = frames[0], f1 = frames[frames.length - 1]
    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i].pressure <= p && frames[i + 1].pressure >= p) {
        f0 = frames[i]; f1 = frames[i + 1]; break
      }
    }
    const t = f1.pressure === f0.pressure ? 0 : (p - f0.pressure) / (f1.pressure - f0.pressure)

    // Compute selected cells bbox in scene space
    const pts = cells.map(id => { const [r, c] = id.split('-').map(Number); return bkgPos(r, c, floorIdx) })
    if (!pts.length) return null
    const xs = pts.map(p => p[0]), zs = pts.map(p => p[2])
    const bx0 = Math.min(...xs) - BKG_M / 2, bx1 = Math.max(...xs) + BKG_M / 2
    const bz0 = Math.min(...zs) - BKG_M / 2, bz1 = Math.max(...zs) + BKG_M / 2
    const bw = bx1 - bx0, bd = bz1 - bz0   // scene width, depth
    const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2

    // GH mesh: 26 cols × 51 rows, step 1.4m → spans 35m (X) × 70m (Y in GH = scene -Z)
    const GH_W = 35, GH_D = 70
    const scaleX = bw / GH_W, scaleZ = bd / GH_D

    // Roof must sit at the TOP of the assembled walls
    const floorY = bkgPos(0, 0, floorIdx)[1] + FLOOR_H_M

    const v0 = f0.vertices, v1 = f1.vertices
    const positions = new Float32Array(v0.length * 3)
    for (let i = 0; i < v0.length; i++) {
      const ghX = v0[i][0] * (1 - t) + v1[i][0] * t
      const ghY = v0[i][1] * (1 - t) + v1[i][1] * t
      const ghZ = v0[i][2] * (1 - t) + v1[i][2] * t
      // GH X → scene X (centered + scaled), GH Y → scene -Z (centered + scaled), GH Z → height above floor
      positions[i * 3]     = bcx + (ghX - GH_W / 2) * scaleX
      positions[i * 3 + 1] = floorY + ghZ * 0.5   // compressed to half height so it sits nicely
      positions[i * 3 + 2] = bcz - (ghY - GH_D / 2) * scaleZ
    }

    const indices = []
    for (const f of morphData.faces) {
      indices.push(f[0], f[1], f[2])
      if (f[3] !== f[2]) { indices.push(f[0], f[2], f[3]) }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [morphData, inflation, cells, floorIdx])

  if (!geometry) return null
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#a8d8ff"
        transparent
        opacity={0.55}
        side={THREE.DoubleSide}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  )
}

// ── assembly: 3D geometry (inside Canvas) ────────────────────────────────────
function AssemblyGeometry({ booking, wallTypesMap, activeWallId, onSelectWall, animStep, roofEnabled, roofMorphData, roofInflation }) {
  const floorIdx  = booking.floor
  const cellsKey  = booking.cells.join(',')
  const walls     = useMemo(() => getPerimeterWalls(booking.cells, floorIdx), [cellsKey, floorIdx])
  const intWalls  = useMemo(() => getInteriorWalls(booking.cells,  floorIdx), [cellsKey, floorIdx])

  // shared geometries — inflate when slider > 0
  const inflation = roofEnabled ? (roofInflation ?? 0) : 0
  const hGeo  = useMemo(() => inflation > 0 ? makeInflatableWallGeo('h', inflation) : new THREE.BoxGeometry(BKG_M, FLOOR_H_M, 0.14), [inflation])
  const vGeo  = useMemo(() => inflation > 0 ? makeInflatableWallGeo('v', inflation) : new THREE.BoxGeometry(0.14, FLOOR_H_M, BKG_M), [inflation])
  const flGeo = useMemo(() => new THREE.BoxGeometry(BKG_M - 0.06, 0.18, BKG_M - 0.06), [])

  // shared materials — all switched imperatively in useFrame, never via JSX props
  const matSolid   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#FFE600', emissive: '#FFE600', emissiveIntensity: 0.18, roughness: 0.65, metalness: 0.05 }), [])
  const matGlazed  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4CC9F0', transparent: true, opacity: 0.30, roughness: 0,   metalness: 0.2, depthWrite: false, side: THREE.DoubleSide }), [])
  const matCurtain = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c8a96e', transparent: true, opacity: 0.44, roughness: 0.9, depthWrite: false, side: THREE.DoubleSide }), [])
  const matActive  = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.70, roughness: 0.2, emissive: '#FFE600', emissiveIntensity: 0.55, side: THREE.DoubleSide }), [])
  const matHovered = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide }), [])
  const matFloor   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#a07800', emissive: '#FFE600', emissiveIntensity: 0.22, roughness: 0.85 }), [])

  // all animation + interaction state lives in refs to avoid re-renders inside useFrame
  const wallRefs     = useRef([])
  const progressRef  = useRef(walls.map(() => 0))
  const animStepRef  = useRef(animStep)
  const wallTypesRef = useRef(wallTypesMap)
  const activeRef    = useRef(activeWallId)
  const hoveredRef   = useRef(null)

  useEffect(() => { animStepRef.current = animStep },    [animStep])
  useEffect(() => { wallTypesRef.current = wallTypesMap }, [wallTypesMap])
  useEffect(() => { activeRef.current = activeWallId },  [activeWallId])

  // fires once on mount (component is key'd by assemblyId)
  useEffect(() => {
    progressRef.current = walls.map(() => 0)
    wallRefs.current.forEach((mesh, i) => {
      if (!mesh || !walls[i]) return
      const [bx, by, bz] = walls[i].pos
      const [dx, , dz]   = walls[i].dir
      mesh.position.set(bx + dx * 9, by, bz + dz * 9)
    })
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    // pulse yellow glow on default solid walls and floor slabs
    matSolid.emissiveIntensity = 0.12 + 0.10 * Math.sin(t * 1.5)
    matFloor.emissiveIntensity = 0.18 + 0.14 * Math.sin(t * 1.5)
    matActive.emissiveIntensity = 0.40 + 0.25 * Math.sin(t * 2.2)

    walls.forEach((wall, i) => {
      const mesh = wallRefs.current[i]
      if (!mesh) return

      const type  = wallTypesRef.current[wall.id] || 'solid'
      const isAct = activeRef.current  === wall.id
      const isHov = hoveredRef.current === wall.id && !isAct && type !== 'open'

      mesh.visible  = type !== 'open'
      mesh.material = isAct     ? matActive
                    : isHov     ? matHovered
                    : type === 'glazed'  ? matGlazed
                    : type === 'curtain' ? matCurtain
                    : matSolid

      // slide animation
      const target = i < animStepRef.current ? 1 : 0
      progressRef.current[i] = THREE.MathUtils.lerp(progressRef.current[i], target, 0.055)
      const p = progressRef.current[i]
      const [bx, by, bz] = wall.pos
      const [dx, , dz]   = wall.dir
      mesh.position.set(bx + dx * (1 - p) * 9, by, bz + dz * (1 - p) * 9)
    })
  })

  return (
    <group>
      {booking.cells.map(cellId => {
        const [r, c] = cellId.split('-').map(Number)
        const [cx, cy, cz] = bkgPos(r, c, floorIdx)
        return <mesh key={cellId} geometry={flGeo} material={matFloor} position={[cx, cy - 0.05, cz]} receiveShadow />
      })}

      {walls.map((wall, i) => (
        <mesh
          key={wall.id}
          ref={el => { wallRefs.current[i] = el }}
          geometry={wall.geo === 'h' ? hGeo : vGeo}
          castShadow
          receiveShadow
          onClick={e => { e.stopPropagation(); onSelectWall(wall.id) }}
          onPointerOver={e => { e.stopPropagation(); hoveredRef.current = wall.id }}
          onPointerOut={e  => { if (hoveredRef.current === wall.id) hoveredRef.current = null }}
        />
      ))}

      {/* Interior partition walls — static (no animation), appear immediately on combo select */}
      {intWalls.map(w => {
        const type = wallTypesMap[`int-${w.id}`] || 'open'
        if (type === 'open') return null
        return (
          <mesh
            key={`int-${w.id}`}
            geometry={w.geo === 'h' ? hGeo : vGeo}
            material={type === 'glazed' ? matGlazed : type === 'curtain' ? matCurtain : matSolid}
            position={w.pos}
            castShadow
            receiveShadow
          />
        )
      })}

      {/* Parametric GH roof */}
      {roofEnabled && roofMorphData && (
        <RoofMesh
          morphData={roofMorphData}
          inflation={roofInflation}
          cells={booking.cells}
          floorIdx={floorIdx}
        />
      )}
    </group>
  )
}

// ── floating ambient cubes ────────────────────────────────────────────────────
const FC_COUNT   = 22
const FC_INNER_R = 28
const FC_OUTER_R = 52
const TRAIL_LEN  = 22   // number of trail positions kept per cube

// trail shader — per-vertex alpha fade from head (1) to tail (0)
const TRAIL_VERT = `
  attribute float alpha;
  varying float vAlpha;
  void main() {
    vAlpha = alpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const TRAIL_FRAG = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(uColor, vAlpha * vAlpha);
  }
`

function mkFC() {
  const angle = Math.random() * Math.PI * 2
  const dist  = FC_INNER_R + 4 + Math.random() * 18
  return {
    p:    [Math.cos(angle) * dist, -8 + Math.random() * 20, Math.sin(angle) * dist],
    v:    [(Math.random() - 0.5) * 0.024, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.024],
    r:    [(Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.004, 0],
    ph:   Math.random() * Math.PI * 2,
    bv:   [0, 0, 0],
    tgt:  null,
    mode: 'free',
  }
}

function spawnOuter() {
  const angle = Math.random() * Math.PI * 2
  const dist  = FC_INNER_R + 6 + Math.random() * 14
  return {
    p: [Math.cos(angle) * dist, -8 + Math.random() * 20, Math.sin(angle) * dist],
    v: [(Math.random() - 0.5) * 0.024, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.024],
    r: [(Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.004, 0],
  }
}

function FloatingCubes({ selCells, assembling }) {
  const selRef   = useRef(selCells)
  selRef.current = selCells
  const asmRef   = useRef(assembling)
  asmRef.current = assembling

  const prevSelN     = useRef(0)
  const prevAsm      = useRef(false)
  const pendingBurst = useRef(false)
  const burstAt      = useRef(0)
  const cubes        = useRef(Array.from({ length: FC_COUNT }, mkFC))
  const meshRefs     = useRef([])

  // trail geometry buffers — one per cube, created once
  const trailData = useRef(
    Array.from({ length: FC_COUNT }, () => {
      const positions = new Float32Array(TRAIL_LEN * 3)  // xyz per point
      const alphas    = new Float32Array(TRAIL_LEN)
      for (let j = 0; j < TRAIL_LEN; j++) alphas[j] = 1 - j / (TRAIL_LEN - 1)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setAttribute('alpha',    new THREE.BufferAttribute(alphas,    1))
      return { positions, geo }
    })
  )

  // cube body materials
  const mats = useMemo(() => ({
    free:   new THREE.MeshStandardMaterial({ color: '#4CC9F0', transparent: true, opacity: 0.18, roughness: 0.6, metalness: 0.15, depthWrite: false }),
    flying: new THREE.MeshStandardMaterial({ color: '#FFE600', transparent: true, opacity: 0.52, roughness: 0.4, metalness: 0.05, emissive: '#FFE600', emissiveIntensity: 0.12, depthWrite: false }),
    hover:  new THREE.MeshStandardMaterial({ color: '#FFE600', transparent: true, opacity: 0.72, roughness: 0.35, metalness: 0.05, emissive: '#FFE600', emissiveIntensity: 0.22, depthWrite: false }),
    burst:  new THREE.MeshStandardMaterial({ color: '#FF6B35', transparent: true, opacity: 0.48, roughness: 0.5, emissive: '#FF3300', emissiveIntensity: 0.20, depthWrite: false }),
  }), [])

  // trail line materials (shared across all cubes)
  const flyTrailMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#FFE600') } },
    vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
    transparent: true, depthWrite: false,
  }), [])
  const burstTrailMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#FF8844') } },
    vertexShader: TRAIL_VERT, fragmentShader: TRAIL_FRAG,
    transparent: true, depthWrite: false,
  }), [])

  // one THREE.Line per cube — created imperatively, updated each frame
  const trailObjs = useMemo(() =>
    trailData.current.map(({ geo }) => {
      const line = new THREE.Line(geo, flyTrailMat)
      line.visible = false
      line.frustumCulled = false
      return line
    }),
  [flyTrailMat])

  const boxGeo = useMemo(() => new THREE.BoxGeometry(4.2, 2.8, 4.2), [])

  useFrame(({ clock }) => {
    const t  = clock.getElapsedTime()
    const sc = selRef.current
    const N  = sc.length
    const c  = cubes.current

    let cx=0, cy=0, cz=0
    if (N > 0) {
      sc.forEach(([x,y,z])=>{ cx+=x; cy+=y; cz+=z })
      cx/=N; cy/=N; cz/=N
    }

    // ── selection change ──
    const selN = N
    if (selN !== prevSelN.current) {
      const prev = prevSelN.current
      prevSelN.current = selN
      if (selN > prev) {
        for (let i = prev; i < selN && i < FC_COUNT; i++) {
          c[i].tgt = [...sc[i]]; c[i].mode = 'flying'
        }
      } else {
        for (let i = selN; i < prev && i < FC_COUNT; i++) {
          Object.assign(c[i], spawnOuter(), { tgt: null, mode: 'free', bv: [0,0,0] })
        }
        for (let i = 0; i < selN && i < FC_COUNT; i++) {
          c[i].tgt = [...sc[i]]
          if (c[i].mode === 'hover') c[i].mode = 'flying'
        }
      }
    }

    // ── assembly trigger ──
    const asm      = asmRef.current
    const asmStart = asm && !prevAsm.current
    const asmStop  = !asm && prevAsm.current
    prevAsm.current = asm

    if (asmStart) { pendingBurst.current = true; burstAt.current = t + 1.4 }

    if (pendingBurst.current && t >= burstAt.current) {
      pendingBurst.current = false
      for (let i = 0; i < FC_COUNT; i++) {
        if (c[i].mode === 'flying' || c[i].mode === 'hover') {
          const dx=c[i].p[0]-cx, dy=c[i].p[1]-cy-2, dz=c[i].p[2]-cz
          const l = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1
          const s = 1.5 + Math.random() * 1.0
          c[i].bv = [dx/l*s, Math.abs(dy/l)*s*0.6+0.5, dz/l*s]
          c[i].mode = 'burst'
        }
      }
    }

    if (asmStop) {
      pendingBurst.current = false
      for (let i = 0; i < FC_COUNT; i++) Object.assign(c[i], mkFC(), { bv:[0,0,0] })
      prevSelN.current = 0
    }

    // ── pulse material opacities ──
    mats.free.opacity   = 0.14 + 0.06 * Math.sin(t * 0.6)
    mats.flying.opacity = 0.45 + 0.14 * Math.sin(t * 2.0)
    mats.flying.emissiveIntensity = 0.08 + 0.08 * Math.sin(t * 1.8)
    mats.hover.opacity  = 0.60 + 0.18 * Math.sin(t * 2.6)
    mats.hover.emissiveIntensity  = 0.18 + 0.16 * Math.sin(t * 2.6)
    mats.burst.opacity  = 0.40 + 0.18 * Math.sin(t * 4.5)

    // ── per-cube update ──
    for (let i = 0; i < FC_COUNT; i++) {
      const cube = c[i]
      const mesh = meshRefs.current[i]
      const tl   = trailObjs[i]
      const td   = trailData.current[i]
      if (!mesh) continue

      if (cube.mode === 'free') {
        cube.p[0] += cube.v[0]
        cube.p[1] += cube.v[1] + Math.sin(t * 0.34 + cube.ph) * 0.009
        cube.p[2] += cube.v[2]
        const rx = cube.p[0], rz = cube.p[2]
        const r2 = rx*rx + rz*rz
        if (r2 < FC_INNER_R * FC_INNER_R) {
          const r = Math.sqrt(r2) || 1
          const f = (FC_INNER_R - r) / FC_INNER_R * 0.06
          cube.v[0] += rx/r * f; cube.v[2] += rz/r * f
        }
        const vxz = Math.sqrt(cube.v[0]*cube.v[0]+cube.v[2]*cube.v[2])
        if (vxz > 0.05) { cube.v[0]=cube.v[0]/vxz*0.05; cube.v[2]=cube.v[2]/vxz*0.05 }
        const outerR = Math.sqrt(cube.p[0]*cube.p[0]+cube.p[2]*cube.p[2])
        if (outerR > FC_OUTER_R) {
          const ang = Math.atan2(cube.p[2], cube.p[0]) + Math.PI
          const nd  = FC_INNER_R + 6 + Math.random() * 10
          cube.p[0] = Math.cos(ang) * nd; cube.p[2] = Math.sin(ang) * nd
        }
        if (cube.p[1] >  16) cube.p[1] = -8
        if (cube.p[1] <  -8) cube.p[1] =  16
        cube.r[0] *= 0.997; cube.r[1] *= 0.997

      } else if (cube.mode === 'flying') {
        const [tx, ty, tz] = cube.tgt
        cube.p[0] = THREE.MathUtils.lerp(cube.p[0], tx, 0.055)
        cube.p[1] = THREE.MathUtils.lerp(cube.p[1], ty + 2.2, 0.055)
        cube.p[2] = THREE.MathUtils.lerp(cube.p[2], tz, 0.055)
        cube.r[0] = Math.sign(cube.r[0]||1) * Math.min(0.13, Math.abs(cube.r[0]) * 1.05)
        cube.r[1] = Math.sign(cube.r[1]||1) * Math.min(0.13, Math.abs(cube.r[1]) * 1.05)
        const ddx=cube.p[0]-tx, ddz=cube.p[2]-tz
        if (ddx*ddx+ddz*ddz < 0.9) cube.mode = 'hover'

      } else if (cube.mode === 'hover') {
        const [tx, ty, tz] = cube.tgt
        cube.p[0] = THREE.MathUtils.lerp(cube.p[0], tx, 0.04)
        cube.p[1] = THREE.MathUtils.lerp(cube.p[1], ty + 1.8 + Math.sin(t*1.1+cube.ph)*0.45, 0.04)
        cube.p[2] = THREE.MathUtils.lerp(cube.p[2], tz, 0.04)
        cube.r[0] *= 0.93; cube.r[1] *= 0.93

      } else if (cube.mode === 'burst') {
        cube.p[0]+=cube.bv[0]; cube.p[1]+=cube.bv[1]; cube.p[2]+=cube.bv[2]
        cube.bv[0]*=0.84; cube.bv[1]*=0.84; cube.bv[2]*=0.84
        cube.r[0] = Math.sign(cube.r[0]||1)*Math.min(0.16, Math.abs(cube.r[0])*1.06)
        cube.r[1] = Math.sign(cube.r[1]||1)*Math.min(0.16, Math.abs(cube.r[1])*1.06)
        const sp = cube.bv[0]*cube.bv[0]+cube.bv[1]*cube.bv[1]+cube.bv[2]*cube.bv[2]
        if (sp < 0.004) Object.assign(c[i], spawnOuter(), { tgt:null, mode:'free', bv:[0,0,0] })
      }

      mesh.position.set(cube.p[0], cube.p[1], cube.p[2])
      mesh.rotation.x += cube.r[0]
      mesh.rotation.y += cube.r[1]

      const mat = cube.mode === 'flying' ? mats.flying
                : cube.mode === 'hover'  ? mats.hover
                : cube.mode === 'burst'  ? mats.burst
                : mats.free
      if (mesh.material !== mat) mesh.material = mat

      // ── trail update ──
      const showTrail = cube.mode === 'flying' || cube.mode === 'burst'
      if (tl) {
        tl.visible = showTrail
        if (showTrail) {
          // shift old positions back by one slot (index 0 = newest / head)
          const pos = td.positions
          for (let j = TRAIL_LEN - 1; j > 0; j--) {
            pos[j*3]   = pos[(j-1)*3]
            pos[j*3+1] = pos[(j-1)*3+1]
            pos[j*3+2] = pos[(j-1)*3+2]
          }
          pos[0] = cube.p[0]; pos[1] = cube.p[1]; pos[2] = cube.p[2]
          td.geo.attributes.position.needsUpdate = true
          tl.material = cube.mode === 'burst' ? burstTrailMat : flyTrailMat
        } else {
          // flush buffer to current position — prevents ghost trail on next activation
          const pos = td.positions
          for (let j = 0; j < TRAIL_LEN; j++) {
            pos[j*3]=cube.p[0]; pos[j*3+1]=cube.p[1]; pos[j*3+2]=cube.p[2]
          }
          td.geo.attributes.position.needsUpdate = true
        }
      }
    }
  })

  return (
    <group>
      {cubes.current.map((c, i) => (
        <mesh
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          geometry={boxGeo}
          material={mats.free}
          position={[...c.p]}
        />
      ))}
      {trailObjs.map((obj, i) => (
        <primitive key={`tr${i}`} object={obj} />
      ))}
    </group>
  )
}

// ── assembly: right panel content ────────────────────────────────────────────
const WALL_TYPES  = ['solid', 'glazed', 'curtain', 'open']
const SIDE_LABELS = { top: 'North', bottom: 'South', left: 'West', right: 'East' }

const TILE_META = {
  solid:   { icon: '▪', label: 'Solid',   desc: 'Opaque panel — privacy & thermal mass' },
  glazed:  { icon: '◻', label: 'Glazed',  desc: 'Full-height glass — daylight & views'  },
  curtain: { icon: '≋', label: 'Curtain', desc: 'Fabric track — acoustic, flexible'      },
  open:    { icon: '○', label: 'Open',    desc: 'No closure — merges with adjacent space' },
}

// ── wall combination presets ──────────────────────────────────────────────────
// Each combo maps wall `side` → wall type. Applied to all perimeter walls at once.
const WALL_COMBOS = [
  // ── solid/open basics ────────────────────────────────────────────────────────
  { id: 'enclosed',     name: 'Enclosed',     desc: 'Fully enclosed · private space',
    sides: { top:'solid',   bottom:'solid',   left:'solid',   right:'solid'   } },
  { id: 'open-south',   name: 'Open South',   desc: '3-sided shelter · open to south',
    sides: { top:'solid',   bottom:'open',    left:'solid',   right:'solid'   } },
  { id: 'open-north',   name: 'Open North',   desc: '3-sided enclosure · open to north',
    sides: { top:'open',    bottom:'solid',   left:'solid',   right:'solid'   } },
  { id: 'corridor-ew',  name: 'E–W Passage',  desc: 'Open north + south · east–west flow',
    sides: { top:'open',    bottom:'open',    left:'solid',   right:'solid'   } },
  { id: 'corner-nw',    name: 'Corner NW',    desc: 'North–west shelter · 2 open sides',
    sides: { top:'solid',   bottom:'open',    left:'solid',   right:'open'    } },
  { id: 'corner-se',    name: 'Corner SE',    desc: 'South–east shelter · 2 open sides',
    sides: { top:'open',    bottom:'solid',   left:'open',    right:'solid'   } },
  // ── glazed + mixed ───────────────────────────────────────────────────────────
  { id: 'glazed-south', name: 'Glazed South', desc: 'Solid 3 sides · glazed south facade',
    sides: { top:'solid',   bottom:'glazed',  left:'solid',   right:'solid'   } },
  { id: 'glazed-all',   name: 'All Glazed',   desc: 'Fully glazed · maximum transparency',
    sides: { top:'glazed',  bottom:'glazed',  left:'glazed',  right:'glazed'  } },
  { id: 'trama',        name: 'Trama',        desc: 'Woven grid · solid north+south · glazed east+west',
    sides: { top:'solid',   bottom:'solid',   left:'glazed',  right:'glazed'  } },
  { id: 'screen',       name: 'Screen Wrap',  desc: 'All soft curtain boundaries · flexible',
    sides: { top:'curtain', bottom:'curtain', left:'curtain', right:'curtain' } },
  // ── creative / asymmetric ────────────────────────────────────────────────────
  { id: 'pinwheel',     name: 'Pinwheel',     desc: 'Rotating types · solid · glazed · curtain · open',
    sides: { top:'solid',   bottom:'curtain', left:'open',    right:'glazed'  } },
  { id: 'esquina',      name: 'Esquina',      desc: 'Corner pivot · glazed NE · solid SW',
    sides: { top:'glazed',  bottom:'solid',   left:'solid',   right:'glazed'  } },
]

function WallComboPlan({ sides, active }) {
  const C = { solid: '#F48FB1', glazed: '#4CC9F0', curtain: '#FFB347' }
  const sc = (side) => C[sides[side]]
  const cellFill = active ? 'rgba(76,201,240,0.07)' : 'rgba(255,255,255,0.03)'
  const cellStroke = active ? 'rgba(76,201,240,0.28)' : '#2a3a5a'
  return (
    <svg viewBox="0 0 44 44" width="30" height="30" style={{ display: 'block' }}>
      {[[1,1],[23,1],[1,23],[23,23]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={20} height={20}
          fill={cellFill} stroke={cellStroke} strokeWidth={0.8} strokeDasharray="2,1.5" />
      ))}
      {sc('top')    && <line x1={1}  y1={1}  x2={43} y2={1}  stroke={sc('top')}    strokeWidth={2.5} strokeLinecap="square"/>}
      {sc('bottom') && <line x1={1}  y1={43} x2={43} y2={43} stroke={sc('bottom')} strokeWidth={2.5} strokeLinecap="square"/>}
      {sc('left')   && <line x1={1}  y1={1}  x2={1}  y2={43} stroke={sc('left')}   strokeWidth={2.5} strokeLinecap="square"/>}
      {sc('right')  && <line x1={43} y1={1}  x2={43} y2={43} stroke={sc('right')}  strokeWidth={2.5} strokeLinecap="square"/>}
    </svg>
  )
}

// ── interior partition presets ────────────────────────────────────────────────
// filter(wall, index) returns the wall type for each interior wall
const INTERIOR_COMBOS = [
  { id: 'none',      name: 'Open Plan',    desc: 'No partitions · single flowing space',
    showH: false, showV: false,
    filter: ()      => 'open'  },
  { id: 'full',      name: 'Full Grid',    desc: 'All shared walls solid · Cruz pattern',
    showH: true,  showV: true,  hColor: '#F48FB1', vColor: '#F48FB1',
    filter: ()      => 'solid' },
  { id: 'spine-ew',  name: 'E–W Spine',    desc: 'Horizontal divider only · splits N/S',
    showH: true,  showV: false, hColor: '#F48FB1',
    filter: (w)     => w.geo === 'h' ? 'solid' : 'open' },
  { id: 'spine-ns',  name: 'N–S Spine',    desc: 'Vertical divider only · splits E/W',
    showH: false, showV: true,  vColor: '#F48FB1',
    filter: (w)     => w.geo === 'v' ? 'solid' : 'open' },
  { id: 'glazed',    name: 'Glass Divide', desc: 'All partitions glazed · shared visibility',
    showH: true,  showV: true,  hColor: '#4CC9F0', vColor: '#4CC9F0',
    filter: ()      => 'glazed' },
  { id: 'curtain',   name: 'Curtain Div',  desc: 'Soft curtain dividers · flexible plan',
    showH: true,  showV: true,  hColor: '#FFB347', vColor: '#FFB347',
    filter: ()      => 'curtain' },
  { id: 'mixed',     name: 'Glass + Solid',desc: 'E–W glazed · N–S solid · layered grid',
    showH: true,  showV: true,  hColor: '#4CC9F0', vColor: '#F48FB1',
    filter: (w)     => w.geo === 'h' ? 'glazed' : 'solid' },
  { id: 'alternate', name: 'Alternate',    desc: 'Every other partition · enfilade reading',
    showH: true,  showV: false, hColor: '#F48FB1',
    filter: (_, i) => i % 2 === 0 ? 'solid' : 'open' },
]

function InteriorComboPlan({ combo, active }) {
  const cellFill   = active ? 'rgba(76,201,240,0.07)' : 'rgba(255,255,255,0.03)'
  const cellStroke = active ? 'rgba(76,201,240,0.28)' : '#2a3a5a'
  return (
    <svg viewBox="0 0 44 44" width="30" height="30" style={{ display: 'block' }}>
      {[[1,1],[23,1],[1,23],[23,23]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={20} height={20}
          fill={cellFill} stroke={cellStroke} strokeWidth={0.8} strokeDasharray="2,1.5" />
      ))}
      {/* faint perimeter border */}
      <rect x={1} y={1} width={42} height={42} fill="none" stroke="#3a4a6a" strokeWidth={1} />
      {/* interior H partition (divides top/bottom rows) */}
      {combo.showH && <line x1={1} y1={22} x2={43} y2={22} stroke={combo.hColor || '#F48FB1'} strokeWidth={2.5} strokeLinecap="square"/>}
      {/* interior V partition (divides left/right columns) */}
      {combo.showV && <line x1={22} y1={1}  x2={22} y2={43} stroke={combo.vColor || '#F48FB1'} strokeWidth={2.5} strokeLinecap="square"/>}
    </svg>
  )
}

function AssemblyPanel({ booking, assemblyWalls, animStep, wallTypes, activeWallId, onClose, onPlay, onReset, onSetWallType, onSelectWall, roofMorphData, onSetRoof }) {
  const n       = booking.cells.length
  const sqm     = (n * BKG_SQM).toFixed(0)
  const fl      = BKG_FLOORS[booking.floor]
  const total   = assemblyWalls.length
  const placed  = Math.min(animStep, total)
  const allIn   = placed >= total && total > 0
  const activeW = assemblyWalls.find(w => w.id === activeWallId)
  const curType = activeW ? (wallTypes[activeW.id] || 'solid') : null

  // count by type for the summary bar
  const typeCounts = WALL_TYPES.reduce((acc, t) => {
    acc[t] = assemblyWalls.filter(w => (wallTypes[w.id] || 'solid') === t).length
    return acc
  }, {})

  return (
    <>
      {/* ── header ── */}
      <div className="asmb-head">
        <button className="asmb-back" onClick={onClose}>← BOOKINGS</button>
        <div className="asmb-title">{booking.activity}</div>
        <div className="asmb-meta">
          {fl.label} · {fl.z}<br />
          {n} cells · {sqm} m² · {total} walls
        </div>
      </div>

      <div className="asmb-scroll">

        {/* ── animation ── */}
        <div className="asmb-section">
          <div className="asmb-ctrl">
            <button className="asmb-btn play" onClick={onPlay} disabled={allIn}>
              {allIn ? '✓ All placed' : '▶ Animate walls'}
            </button>
            <button className="asmb-btn reset" onClick={onReset} title="Reset animation">↺</button>
          </div>
          <div className="asmb-prog-bar">
            <div className="asmb-prog-fill" style={{ width: total > 0 ? `${(placed / total) * 100}%` : '0%' }} />
          </div>
          <div className="asmb-prog-txt">
            {placed === 0 ? `${total} walls · press ▶ to place`
              : allIn   ? 'All walls placed — click any to edit'
              : `${placed} / ${total} walls placed`}
          </div>
        </div>

        {/* ── type picker (appears when a wall is selected) ── */}
        {activeW ? (
          <div className="asmb-section asmb-picker">
            <div className="asmb-pick-label">{SIDE_LABELS[activeW.side]} wall</div>
            <div className="asmb-tiles">
              {WALL_TYPES.map(t => {
                const m = TILE_META[t]
                return (
                  <button
                    key={t}
                    className={`asmb-tile t-${t}${curType === t ? ' active' : ''}`}
                    onClick={() => onSetWallType(activeW.id, t)}
                  >
                    <span className="atile-icon">{m.icon}</span>
                    <span className="atile-lbl">{m.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="asmb-type-desc">{TILE_META[curType].desc}</div>
            <button className="asmb-complete-btn" onClick={() => onSelectWall(null)}>
              ✓ Done editing this wall
            </button>
          </div>
        ) : (
          <div className="asmb-section asmb-idle">
            <div className="asmb-idle-icon">↗</div>
            <div className="asmb-idle-txt">
              Tap any wall in the 3D view<br />to choose its type
            </div>
          </div>
        )}

        {/* ── applied types summary ── */}
        {assemblyWalls.length > 0 && (
          <div className="asmb-section">
            <div className="asmb-slabel">APPLIED TYPES</div>
            <div className="asmb-summary-bar">
              {WALL_TYPES.map(t => typeCounts[t] > 0 && (
                <div key={t} className={`asb-seg t-${t}`} style={{ flex: typeCounts[t] }} title={`${typeCounts[t]} ${t}`} />
              ))}
            </div>
            <div className="asmb-summary-labels">
              {WALL_TYPES.map(t => typeCounts[t] > 0 && (
                <div key={t} className={`asl-item t-${t}`}>
                  <span className={`asl-dot t-${t}`} />
                  {TILE_META[t].label} · {typeCounts[t]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── parametric roof ── */}
        <div className="asmb-section">
          <div className="asmb-slabel">PARAMETRIC ROOF</div>
          <div className="roof-toggle-row">
            <button
              className={`roof-toggle${booking.roofEnabled ? ' active' : ''}`}
              onClick={() => onSetRoof(booking.id, !booking.roofEnabled, booking.roofInflation ?? 0)}
              disabled={!roofMorphData}
              title={roofMorphData ? 'Toggle roof' : 'Export frames from GH first'}
            >
              {booking.roofEnabled ? '⬡ Roof On' : '⬡ Add Roof'}
            </button>
            {!roofMorphData && <span className="roof-no-data">Export frames from GH first</span>}
          </div>
          {booking.roofEnabled && roofMorphData && (
            <div className="roof-slider-wrap">
              <div className="roof-slider-labels">
                <span>Flat</span>
                <span className="roof-pct">{booking.roofInflation ?? 0}%</span>
                <span>Inflated</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={booking.roofInflation ?? 0}
                onChange={e => onSetRoof(booking.id, true, Number(e.target.value))}
                className="roof-slider"
                style={{ '--pct': `${booking.roofInflation ?? 0}%` }}
              />
            </div>
          )}
        </div>

      </div>
    </>
  )
}

// ── booking: right panel (DOM overlay in editor mode) ────────────────────────
function BookingRightPanel({
  floor, onFloor, sel, onToggle, onClearSel, bookings, onBookings,
  assemblyId, assemblyWalls, assemblyStep, wallTypes, activeWallId,
  onStartAssembly, onCloseAssembly, onPlayAssembly, onResetAssembly,
  onSetWallType, onSelectWall, roofMorphData, onSetRoof,
}) {
  const [name,     setName]     = useState('')
  const [duration, setDuration] = useState(BKG_DURATIONS[0])
  const [notes,    setNotes]    = useState('')
  const [activity, setActivity] = useState('')
  const [errs,     setErrs]     = useState({})
  const [toast,    setToast]    = useState(null)
  // 2-step stayroom flow: 1=details, 2=confirmed
  const [srStep,   setSrStep]   = useState(1)
  const [srBkg,    setSrBkg]    = useState(null)
  const formRef = useRef(null)
  const nameRef = useRef(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  const isSrFloor = STAY_ROOM_FLOOR_SET.has(floor)

  // when a room is selected: scroll form into view, focus name
  useEffect(() => {
    if (sel.size > 0) {
      setSrStep(1)
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        nameRef.current?.focus()
      }, 80)
    }
  }, [sel])

  // reset step when floor changes or selection cleared
  useEffect(() => { setSrStep(1); setSrBkg(null) }, [floor])

  const flBkgs       = bookings.filter(b => b.floor === floor).slice().reverse()
  const selN         = sel.size
  const selSqm       = isSrFloor
    ? [...sel].reduce((sum, id) => { const r = srRoomById(floor, id); return sum + (r ? (r.xmax-r.xmin)*(r.ymax-r.ymin) : 0) }, 0).toFixed(0)
    : (selN * BKG_SQM).toFixed(0)
  const selRoomLabel = isSrFloor && selN === 1 ? srRoomById(floor, [...sel][0])?.label : null
  const assemblyBkg  = assemblyId ? bookings.find(b => b.id === assemblyId) : null

  // ── non-stayroom submit (original 1-step) ────────────────────────────────────
  const submitGrid = (e) => {
    e.preventDefault()
    const ne = {}
    if (!name.trim()) ne.name = true
    if (!activity)    ne.act  = true
    if (Object.keys(ne).length) { setErrs(ne); return }
    const bkg = {
      id: 'bkg_' + Date.now(), floor, cells: [...sel], activity,
      userName: name.trim(), duration, notes: notes.trim(),
      bookedAt: new Date().toISOString(), status: 'confirmed',
      roofEnabled: false, roofInflation: 0,
    }
    bkgSave(bkg)
    onBookings(bkgLoad())
    onClearSel()
    setName(''); setActivity(''); setNotes(''); setErrs({})
    showToast('Booked · ' + bkg.cells.length + ' cells · ' + activity + ' · ' + BKG_FLOORS[floor].label)
  }

  // ── stayroom step 1 → confirm + save ────────────────────────────────────────
  const srConfirm = (e) => {
    e.preventDefault()
    const ne = {}
    if (!name.trim()) ne.name = true
    if (Object.keys(ne).length) { setErrs(ne); return }
    setErrs({})
    const bkg = {
      id: 'bkg_' + Date.now(), floor, cells: [...sel], activity: 'Stay Room',
      userName: name.trim(), duration, notes: notes.trim(),
      sqm: selSqm, roomLabel: selRoomLabel,
      bookedAt: new Date().toISOString(), status: 'confirmed',
      roofEnabled: false, roofInflation: 0,
    }
    bkgSave(bkg)
    onBookings(bkgLoad())
    onClearSel()
    setSrBkg(bkg)
    setSrStep(2)
    showToast('Room booked · ' + (selRoomLabel || 'Stay Room') + ' · ' + BKG_FLOORS[floor].label)
  }

  // ── stayroom done → reset ────────────────────────────────────────────────────
  const srDone = () => {
    setName(''); setNotes(''); setDuration(BKG_DURATIONS[0])
    setSrStep(1); setSrBkg(null)
  }

  const doCancel = (id, num) => {
    if (!confirm('Cancel booking #' + num + '?')) return
    bkgCancel(id)
    onBookings(bkgLoad())
    if (assemblyId === id) onCloseAssembly()
    showToast('Booking #' + num + ' cancelled')
  }

  return (
    <div className="brp">
      {assemblyBkg ? (
        <AssemblyPanel
          booking={assemblyBkg}
          assemblyWalls={assemblyWalls}
          animStep={assemblyStep}
          wallTypes={wallTypes}
          activeWallId={activeWallId}
          onClose={onCloseAssembly}
          onPlay={onPlayAssembly}
          onReset={onResetAssembly}
          onSetWallType={onSetWallType}
          onSelectWall={onSelectWall}
          roofMorphData={roofMorphData}
          onSetRoof={onSetRoof}
        />
      ) : (
        <>
          <div className="brp-head">
            <div className="brp-title">BOOK SPACE</div>
            <div className="brp-floor-tabs">
              {BKG_FLOORS.map((f, i) => (
                <button key={i} className={`brp-tab${floor === i ? ' active' : ''}`} onClick={() => onFloor(i)}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="brp-floor-info">
              <span className="brp-fname">{BKG_FLOORS[floor].name}</span>
              <span className="brp-fz">{BKG_FLOORS[floor].z}</span>
            </div>
            {/* stayroom: show step breadcrumb when active */}
            {isSrFloor && selN > 0 && srStep === 1 ? (
              <div className="brp-steps">
                <span className="brs-active">1 Details</span>
                <span className="brs-sep">›</span>
                <span>2 Confirm</span>
              </div>
            ) : (
              <div className={`brp-counter${selN > 0 ? ' has-sel' : ''}`}>
                {selN === 0
                  ? (isSrFloor ? 'Select a stay room in the 3D view →' : 'Click cells in the 3D view →')
                  : isSrFloor
                    ? (selRoomLabel || (selN + ' rooms')) + ' · ' + selSqm + ' m²'
                    : selN + ' cell' + (selN > 1 ? 's' : '') + ' · ' + selSqm + ' m²'}
              </div>
            )}
          </div>

          <div className="brp-scroll">

            {/* ── STAYROOM FLOORS: 3-step flow ── */}
            {isSrFloor && selN > 0 && srStep === 1 && (
              <div className="bs-section" ref={formRef}>
                <div className="bs-label">Booking Details</div>
                <div className="bs-sel-sum sr-sel-sum">
                  <span className="sr-room-tag">{selRoomLabel || 'Stay Room'}</span>
                  {selSqm} m² &nbsp;·&nbsp; {BKG_FLOORS[floor].label}
                </div>
                <form onSubmit={srConfirm} noValidate>
                  <div className={`bsf${errs.name ? ' has-err' : ''}`}>
                    <label>Your name</label>
                    <input ref={nameRef} type="text" value={name} onChange={e => { setName(e.target.value); setErrs(p => ({...p, name: false})) }} placeholder="e.g. Divya M." />
                    {errs.name && <div className="bsf-err">Name is required</div>}
                  </div>
                  <div className="bsf">
                    <label>Duration of stay</label>
                    <select value={duration} onChange={e => setDuration(e.target.value)}>
                      {BKG_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="bsf">
                    <label>Notes (optional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. accessibility, quiet floor…" maxLength={200} />
                  </div>
                  <button type="submit" className="bs-btn-book">Confirm Booking →</button>
                </form>
              </div>
            )}

            {isSrFloor && srStep === 2 && srBkg && (
              <div className="bs-section sr-confirmed" ref={formRef}>
                <div className="sr-conf-icon">✓</div>
                <div className="sr-conf-title">Booking Confirmed</div>
                <div className="sr-conf-id">#{srBkg.id.replace('bkg_','')}</div>
                <div className="sr-conf-details">
                  <div className="sr-cd-row"><span>Room</span><b>{srBkg.roomLabel || 'Stay Room'} · {BKG_FLOORS[srBkg.floor].label}</b></div>
                  <div className="sr-cd-row"><span>Area</span><b>{srBkg.sqm} m²</b></div>
                  <div className="sr-cd-row"><span>Duration</span><b>{srBkg.duration}</b></div>
                  <div className="sr-cd-row"><span>Guest</span><b>{srBkg.userName}</b></div>
                  {srBkg.notes && <div className="sr-cd-row"><span>Notes</span><b>{srBkg.notes}</b></div>}
                  <div className="sr-cd-row"><span>Date</span><b>{new Date(srBkg.bookedAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</b></div>
                </div>
                <button className="bs-btn-book" style={{marginTop:'1rem'}} onClick={srDone}>Done · Book another →</button>
              </div>
            )}

            {/* ── NON-STAYROOM floors: original 1-step grid booking ── */}
            {!isSrFloor && selN > 0 && (
              <div className="bs-section" ref={formRef}>
                <div className="bs-label">Book a space</div>
                <div className="bs-sel-sum">
                  {selN} × 5 m cell{selN > 1 ? 's' : ''} · {selSqm} m² · {BKG_FLOORS[floor].label}
                </div>
                <form onSubmit={submitGrid} noValidate>
                  <div className={`bsf${errs.name ? ' has-err' : ''}`}>
                    <label>Your name</label>
                    <input ref={nameRef} type="text" value={name} onChange={e => { setName(e.target.value); setErrs(p => ({...p, name: false})) }} placeholder="e.g. Divya M." />
                    {errs.name && <div className="bsf-err">Name is required</div>}
                  </div>
                  <div className={`bsf${errs.act ? ' has-err' : ''}`}>
                    <label>Activity</label>
                    <select value={activity} onChange={e => { setActivity(e.target.value); setErrs(p => ({...p, act: false})) }}>
                      <option value="">— select —</option>
                      {BKG_ACTIVITIES.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    {errs.act && <div className="bsf-err">Please select an activity</div>}
                  </div>
                  <div className="bsf">
                    <label>Duration</label>
                    <select value={duration} onChange={e => setDuration(e.target.value)}>
                      {BKG_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="bsf">
                    <label>Notes (optional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Specific requirements…" maxLength={200} />
                  </div>
                  <button type="submit" className="bs-btn-book">Book this space →</button>
                </form>
              </div>
            )}

            <div className="bs-section">
              <div className="bs-label">Confirmed · {BKG_FLOORS[floor].label}</div>
              {flBkgs.length === 0
                ? <div className="bs-empty">No bookings on this floor yet.</div>
                : flBkgs.map((b, i) => {
                  const num = String(flBkgs.length - i).padStart(3, '0')
                  const isStayBkg = b.activity === 'Stay Room' || STAY_ROOM_FLOOR_SET.has(b.floor)
                  const roomData  = isStayBkg ? srRoomById(b.floor, b.cells[0]) : null
                  const areaSqm   = roomData
                    ? ((roomData.xmax-roomData.xmin)*(roomData.ymax-roomData.ymin)).toFixed(0)
                    : (b.cells.length * BKG_SQM).toFixed(0)
                  return (
                    <div key={b.id} className={'bs-card' + (isStayBkg ? ' bs-card-stay' : '')}>
                      <div className="bs-card-head">
                        <span className="bs-card-id">#{num}</span>
                        <span className="bs-card-act">{b.activity}</span>
                        {isStayBkg && <span className="bs-stay-badge">{roomData?.label || 'SR'}</span>}
                      </div>
                      <div className="bs-card-meta">
                        {areaSqm} m² · <b>{b.duration}</b><br />
                        By: <b>{b.userName}</b>
                      </div>
                      <div className="bs-card-btns">
                        {!isStayBkg && (
                          <button className="bs-btn-asm" onClick={() => onStartAssembly(b.id)}>Assemble →</button>
                        )}
                        <button className="bs-btn-cancel" onClick={() => doCancel(b.id, num)}>Cancel ✕</button>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          </div>
        </>
      )}

      {toast && <div className="bkg-toast">{toast}</div>}
    </div>
  )
}

// ── module catalogue: room type definitions (pattern matching added by user) ───
// `units` = number of 5×5 m cells required; used to filter by bkgSel.size
// levels: how many consecutive floors the module occupies (default 1)
const MODULE_DEFS = [
  // ── 1 floor ────────────────────────────────────────────────────────────────
  { id: 'stay-room',        name: 'Stay Room',           units: 1, levels: 1, size: '5 × 5 m',          icon: '⬛', desc: 'Single bay · Fully enclosed · Residential sleeping unit' },
  { id: 'pavilion',         name: 'Open Pavilion',       units: 1, levels: 1, size: '5 × 5 m',          icon: '◇', desc: 'Single bay · All sides open · Freestanding canopy shelter' },
  { id: 'meeting-room',     name: 'Meeting Room',        units: 2, levels: 1, size: '10 × 5 m',         icon: '⬜', desc: 'Double bay · Enclosed 3 sides · Open south' },
  { id: 'rest-room',        name: 'Rest Room',           units: 2, levels: 1, size: '5 × 10 m',         icon: '▮', desc: 'Stacked double bay · Fully enclosed' },
  { id: 'alcove',           name: 'Alcove Niche',        units: 2, levels: 1, size: '10 × 5 m',         icon: '⊏', desc: 'U-shape recess · 3 solid walls · open front face' },
  { id: 'corridor',         name: 'Corridor',            units: 3, levels: 1, size: '15 × 5 m',         icon: '▬', desc: 'Linear triple bay · Walled long sides' },
  { id: 'studio',           name: 'Individual Studio',   units: 3, levels: 1, size: '10 × 5 m + bay',   icon: '⌐', desc: 'L-shape · Private enclosed studio' },
  { id: 'arcade',           name: 'Arcade',              units: 3, levels: 1, size: '15 × 5 m',         icon: '⊢', desc: 'Covered colonnade · glazed front · open ends · sheltered passage' },
  { id: 'public-area',      name: 'Public Area',         units: 4, levels: 1, size: '10 × 10 m',        icon: '⊞', desc: '2×2 grid · Open centre · Community space' },
  { id: 'gallery',          name: 'Gallery',             units: 4, levels: 1, size: '20 × 5 m',         icon: '▭', desc: 'Quad linear bay · Exhibition hall' },
  { id: 'pinwheel-court',   name: 'Pinwheel Court',      units: 4, levels: 1, size: '10 × 10 m',        icon: '✦', desc: '2×2 pinwheel · rotating open + closed sides · courtyard reading' },
  { id: 'pavilion-cluster', name: 'Pavilion Cluster',    units: 4, levels: 1, size: '10 × 10 m',        icon: '⁛', desc: 'Four open bays · independent pavilions sharing a floor plane' },
  { id: 'auditorium',       name: 'Auditorium',          units: 6, levels: 1, size: '15 × 10 m',        icon: '⊿', desc: 'Stepped 3×2 bays · Two-level amphitheatre' },
  { id: 'stair-module',     name: 'Stair Module',        units: 4, levels: 1, size: '10 × 5 m',         icon: '↑', desc: 'Vertical circulation · Single-floor landing' },
  // ── 2 floors ───────────────────────────────────────────────────────────────
  { id: 'sky-box',          name: 'Sky Box',             units: 1, levels: 2, size: '5 × 5 m · 2F',    icon: '◈', desc: 'Double-height single bay · dramatic vertical room · terrace option' },
  { id: 'duplex-unit',      name: 'Duplex Unit',         units: 2, levels: 2, size: '10 × 5 m · 2F',   icon: '⬚', desc: '2-storey residential · split-level entry' },
  { id: 'live-work-unit',   name: 'Live / Work Unit',    units: 2, levels: 2, size: '5 × 10 m · 2F',   icon: '▮▮', desc: 'Ground commercial · upper residential' },
  { id: 'split-level',      name: 'Split Level',         units: 3, levels: 2, size: '15 × 5 m · 2F',   icon: '⊣', desc: 'Staggered half-levels · flowing spatial sequence' },
  { id: 'workshop-loft',    name: 'Workshop + Loft',     units: 3, levels: 2, size: '15 × 5 m · 2F',   icon: '⊤', desc: 'Ground-floor workshop · upper sleeping loft' },
  { id: 'mezzanine-studio', name: 'Mezzanine Studio',    units: 3, levels: 2, size: '15 × 5 m · 2F',   icon: '⌐⌐', desc: 'Studio with raised mezzanine sleeping level' },
  { id: 'void-atrium',      name: 'Void Atrium',         units: 4, levels: 2, size: '10 × 10 m · 2F',  icon: '⊟', desc: 'Double-height courtyard · open sky void above' },
  { id: 'bridge-gallery',   name: 'Bridge Gallery',      units: 4, levels: 2, size: '20 × 5 m · 2F',   icon: '⊫', desc: 'Exhibition hall level + walkway bridge above' },
  { id: 'aba-pavilion',     name: 'ABA Pavilion',        units: 4, levels: 2, size: '10 × 10 m · 2F',  icon: '⁙', desc: 'Pavilion + open bay + pavilion · Beaux-Arts + modern reading' },
  // ── 3 floors ───────────────────────────────────────────────────────────────
  { id: 'beacon-tower',     name: 'Beacon Tower',        units: 1, levels: 3, size: '5 × 5 m · 3F',    icon: '◉', desc: 'Triple-height single bay · vertical landmark · roof terrace' },
  { id: 'stair-tower',      name: 'Stair Tower',         units: 2, levels: 3, size: '10 × 5 m · 3F',   icon: '↑↑', desc: 'Vertical circulation · 3-storey stair core' },
  { id: 'community-hub',    name: 'Community Hub',       units: 3, levels: 3, size: '15 × 5 m · 3F',   icon: '⊥⊥', desc: 'Public · social · programme stacked 3 levels' },
  { id: 'triple-hall',      name: 'Triple-Height Hall',  units: 4, levels: 3, size: '10 × 10 m · 3F',  icon: '⊞⊞', desc: 'Dramatic civic hall · 9.6 m clear height' },
  { id: 'urban-villa',      name: 'Urban Villa',         units: 4, levels: 3, size: '10 × 10 m · 3F',  icon: '⊠', desc: '3-storey residential villa · pinwheel plan · ABA pavilion logic' },
]

// ── catalogue: left panel ─────────────────────────────────────────────────────
function CataloguePanel({ catFloor, catCells, levelCount, onLevelCount, modConfigId, onModConfig }) {
  const selN      = catCells.size
  const fl        = BKG_FLOORS[catFloor]
  const available = MODULE_DEFS.filter(m => m.units === selN && m.levels === levelCount)
  const maxLevels = Math.min(3, 6 - catFloor)  // can't go above floor 5

  return (
    <div className="panel cat-panel">
      <div className="panel-header">
        <div className="panel-logo">Rewire</div>
        <div className="panel-subtitle">Module Catalogue</div>
      </div>

      <div className="cat-ctx">
        <div className="cat-ctx-floor">
          <span className="cat-ctx-label">BASE FLOOR</span>
          <span className="cat-ctx-val">{fl.name}</span>
          <span className="cat-ctx-z">{fl.z}</span>
        </div>
        <div className={`cat-ctx-cells${selN > 0 ? ' has-sel' : ''}`}>
          {selN === 0
            ? 'Select cells in Plan or Iso view'
            : `${selN} cell${selN > 1 ? 's' : ''} × ${levelCount} floor${levelCount > 1 ? 's' : ''} · ${selN * levelCount * BKG_SQM} m² total`}
        </div>
      </div>

      {selN > 0 && (
        <div className="cat-levels">
          <span className="cat-levels-label">VERTICAL LEVELS</span>
          <div className="cat-levels-row">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                disabled={n > maxLevels}
                className={`cat-lvl-btn${levelCount === n ? ' active' : ''}`}
                onClick={() => { onLevelCount(n); onModConfig(null) }}
                title={n > maxLevels ? `Can't add ${n} levels from ${fl.name}` : `${n} floor${n > 1 ? 's' : ''}`}
              >
                {n}F
              </button>
            ))}
          </div>
          {levelCount > 1 && (
            <div className="cat-levels-hint">
              {fl.name} → {BKG_FLOORS[Math.min(catFloor + levelCount - 1, 5)].name}
            </div>
          )}
        </div>
      )}

      <div className="cat-cfg-head">
        <span className="cat-cfg-label">POSSIBLE CONFIGURATIONS</span>
        <span className="cat-cfg-count">{selN > 0 ? available.length : '—'}</span>
      </div>

      <div className="cat-cfg-list">
        {selN === 0 && (
          <div className="cat-empty">
            <div className="cat-empty-icon">↖</div>
            <div className="cat-empty-txt">Select cells in Plan or Iso view<br />then switch back here.<br />Your selection carries over.</div>
          </div>
        )}
        {selN > 0 && available.length === 0 && (
          <div className="cat-empty">
            <div className="cat-empty-icon">—</div>
            <div className="cat-empty-txt">No layout defined for<br />{selN} cells × {levelCount} floor{levelCount > 1 ? 's' : ''} yet.<br />Try a different level count.</div>
          </div>
        )}
        {available.map(m => {
          const isSel = modConfigId === m.id
          return (
            <div key={m.id} className={`mod-card${isSel ? ' active' : ''}`} onClick={() => onModConfig(isSel ? null : m.id)}>
              <div className="mod-card-top">
                <span className="mod-icon">{m.icon}</span>
                <div className="mod-card-info">
                  <div className="mod-name">{m.name}</div>
                  <div className="mod-size">{m.size}</div>
                </div>
              </div>
              <div className="mod-desc">{m.desc}</div>
            </div>
          )
        })}
      </div>

      <div className="panel-footer">
        <div className="stat">
          {modConfigId
            ? `Preview: ${MODULE_DEFS.find(m => m.id === modConfigId)?.name}`
            : selN > 0 ? `${selN} cells · ${levelCount}F · select a layout →` : 'No cells selected'}
        </div>
      </div>
    </div>
  )
}

// ── catalogue: right panel (assembly preview) ─────────────────────────────────
function CatalogueRightPanel({ modConfigId, onClose, catFloor, catCells, levelCount, assemblyWalls, animStep, wallTypes, activeWallId, onPlay, onReset, onSetWallType, onSelectWall, wallComboId, onApplyCombo, interiorComboId, onApplyInteriorCombo, roofEnabled, roofInflation, onToggleRoof, onSetRoofInflation, hasMorphData }) {
  const def    = modConfigId ? MODULE_DEFS.find(m => m.id === modConfigId) : null
  const fl     = BKG_FLOORS[catFloor]
  const selN   = catCells.size
  const total  = assemblyWalls.length
  const placed = Math.min(animStep, total)
  const allIn  = placed >= total && total > 0
  const activeW = assemblyWalls.find(w => w.id === activeWallId)
  const curType = activeW ? (wallTypes[activeW.id] || 'solid') : null

  const typeCounts = WALL_TYPES.reduce((acc, t) => {
    acc[t] = assemblyWalls.filter(w => (wallTypes[w.id] || 'solid') === t).length
    return acc
  }, {})

  if (!def) {
    return (
      <div className="brp">
        <div className="brp-head">
          <div className="brp-title">ASSEMBLY PREVIEW</div>
          <div className="brp-floor-info">
            <span className="brp-fname">{fl.name}</span>
            <span className="brp-fz">{fl.z}</span>
          </div>
          <div className="brp-counter">{selN > 0 ? `${selN} cells × ${levelCount}F · ${selN * levelCount * BKG_SQM} m²` : 'No cells selected'}</div>
        </div>
        <div className="brp-scroll" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', flexDirection: 'column', gap: 10, color: 'var(--muted)', fontSize: 10, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 26, opacity: 0.12 }}>↖</div>
          Select a layout from the left panel to preview its assembly on your selected cells
        </div>
      </div>
    )
  }

  return (
    <div className="brp">
      <div className="asmb-head">
        <button className="asmb-back" onClick={onClose}>← LAYOUTS</button>
        <div className="asmb-title">{def.name}</div>
        <div className="asmb-meta">
          {fl.label}{levelCount > 1 ? ` → ${BKG_FLOORS[Math.min(catFloor + levelCount - 1, 5)].label}` : ''} · {fl.z}<br />
          {selN} cells × {levelCount}F · {selN * levelCount * BKG_SQM} m² · {total * levelCount} walls total
        </div>
      </div>

      <div className="asmb-scroll">

        {/* ── interior partition picker ── */}
        {catCells.size > 1 && total > 0 && (
          <div className="asmb-section">
            <div className="asmb-slabel">INTERIOR PARTITIONS</div>
            <div className="wc-grid">
              {INTERIOR_COMBOS.map(combo => {
                const isAct = interiorComboId === combo.id
                return (
                  <button
                    key={combo.id}
                    className={`wc-card${isAct ? ' active' : ''}`}
                    onClick={() => onApplyInteriorCombo(combo.id)}
                    title={combo.desc}
                  >
                    <InteriorComboPlan combo={combo} active={isAct} />
                    <span className="wc-name">{combo.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── wall combination picker ── */}
        {total > 0 && (
          <div className="asmb-section">
            <div className="asmb-slabel">EXTERIOR WALLS</div>
            <div className="wc-grid">
              {WALL_COMBOS.map(combo => {
                const isAct = wallComboId === combo.id
                return (
                  <button
                    key={combo.id}
                    className={`wc-card${isAct ? ' active' : ''}`}
                    onClick={() => onApplyCombo(combo.id)}
                    title={combo.desc}
                  >
                    <WallComboPlan sides={combo.sides} active={isAct} />
                    <span className="wc-name">{combo.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="asmb-section">
          <div className="asmb-ctrl">
            <button className="asmb-btn play" onClick={onPlay} disabled={allIn}>
              {allIn ? '✓ All placed' : '▶ Animate walls'}
            </button>
            <button className="asmb-btn reset" onClick={onReset} title="Reset">↺</button>
          </div>
          <div className="asmb-prog-bar">
            <div className="asmb-prog-fill" style={{ width: total > 0 ? `${(placed / total) * 100}%` : '0%' }} />
          </div>
          <div className="asmb-prog-txt">
            {placed === 0 ? `${total} walls · press ▶ to place`
              : allIn ? 'All walls placed — click any to edit'
              : `${placed} / ${total} walls placed`}
          </div>
        </div>

        {activeW ? (
          <div className="asmb-section asmb-picker">
            <div className="asmb-pick-label">{SIDE_LABELS[activeW.side]} wall</div>
            <div className="asmb-tiles">
              {WALL_TYPES.map(t => {
                const meta = TILE_META[t]
                return (
                  <button key={t} className={`asmb-tile t-${t}${curType === t ? ' active' : ''}`} onClick={() => onSetWallType(activeW.id, t)}>
                    <span className="atile-icon">{meta.icon}</span>
                    <span className="atile-lbl">{meta.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="asmb-type-desc">{TILE_META[curType].desc}</div>
            <button className="asmb-complete-btn" onClick={() => onSelectWall(null)}>✓ Done editing this wall</button>
          </div>
        ) : (
          <div className="asmb-section asmb-idle">
            <div className="asmb-idle-icon">↗</div>
            <div className="asmb-idle-txt">Tap any wall in the 3D view<br />to choose its type</div>
          </div>
        )}

        {assemblyWalls.length > 0 && (
          <div className="asmb-section">
            <div className="asmb-slabel">APPLIED TYPES</div>
            <div className="asmb-summary-bar">
              {WALL_TYPES.map(t => typeCounts[t] > 0 && (
                <div key={t} className={`asb-seg t-${t}`} style={{ flex: typeCounts[t] }} />
              ))}
            </div>
            <div className="asmb-summary-labels">
              {WALL_TYPES.map(t => typeCounts[t] > 0 && (
                <div key={t} className={`asl-item t-${t}`}>
                  <span className={`asl-dot t-${t}`} />
                  {TILE_META[t].label} · {typeCounts[t]}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── parametric roof ── */}
        <div className="asmb-section">
          <div className="asmb-slabel">PARAMETRIC ROOF</div>
          <div className="roof-toggle-row">
            <button
              className={`roof-toggle${roofEnabled ? ' active' : ''}`}
              onClick={onToggleRoof}
              disabled={!hasMorphData}
              title={hasMorphData ? 'Toggle roof' : 'roof_morph.json not loaded yet'}
            >
              {roofEnabled ? '⬡ Roof On' : '⬡ Add Roof'}
            </button>
            {!hasMorphData && <span className="roof-no-data">Export frames from GH first</span>}
          </div>
          {roofEnabled && hasMorphData && (
            <div className="roof-slider-wrap">
              <div className="roof-slider-labels">
                <span>Flat</span>
                <span className="roof-pct">{roofInflation}%</span>
                <span>Inflated</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={roofInflation}
                onChange={e => onSetRoofInflation(Number(e.target.value))}
                className="roof-slider"
                style={{ '--pct': `${roofInflation}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── (old catalogue component data — kept only so nothing breaks during cleanup) ─
const CATALOGUE_MODULES = [
  {
    id: 'floor-slab',
    name: 'Floor Slab',
    category: 'Structure',
    dims: '5.0 × 5.0 × 0.18 m',
    material: 'Reinforced concrete cassette',
    desc: 'Standard 5×5 m structural floor unit. Stackable to 6 levels.',
    color: '#4a72c0',
    icon: '▬',
    layers: ['Floor G', 'floor 1', 'floor 2', 'floor 3', 'floor 4', 'floor 5'],
  },
  {
    id: 'solid-panel',
    name: 'Solid Wall Panel',
    category: 'Wall',
    dims: '5.0 × 3.2 × 0.14 m',
    material: 'Insulated composite panel',
    desc: 'Opaque thermally insulated wall. Clip-lock assembly onto column grid.',
    color: '#6080b0',
    icon: '▪',
    layers: ['walls', 'walls 2', 'walls 3'],
  },
  {
    id: 'glazed-panel',
    name: 'Glazed Panel',
    category: 'Wall',
    dims: '5.0 × 3.2 × 0.08 m',
    material: 'Triple glazed / aluminium frame',
    desc: 'Full-height glass unit. Maximises daylight and exterior views.',
    color: '#4CC9F0',
    icon: '◻',
    layers: [],
  },
  {
    id: 'curtain-track',
    name: 'Curtain Track',
    category: 'Wall',
    dims: '5.0 × 3.2 m',
    material: 'Acoustic textile / steel track',
    desc: 'Flexible acoustic divider. Slides open in under a minute.',
    color: '#c8a96e',
    icon: '≋',
    layers: [],
  },
  {
    id: 'column',
    name: 'Structural Column',
    category: 'Structure',
    dims: 'Ø 0.30 × 3.2 m',
    material: 'Circular hollow steel section',
    desc: 'Primary vertical load-bearing element. Bolted base plate connection.',
    color: '#8898aa',
    icon: '|',
    layers: ['columns'],
  },
  {
    id: 'stair-module',
    name: 'Stair Module',
    category: 'Circulation',
    dims: '5.0 × 3.0 × 3.2 m',
    material: 'Steel frame / concrete treads',
    desc: 'Pre-assembled stair flight. Delivered as single lift-in unit.',
    color: '#5c8aaa',
    icon: '↑',
    layers: ['stairs', 'staircase'],
  },
  {
    id: 'lift-core',
    name: 'Lift Core',
    category: 'Circulation',
    dims: '2.5 × 2.5 × 3.2 m per floor',
    material: 'Prefabricated concrete shaft',
    desc: 'Modular lift shaft section. One section stacked per floor.',
    color: '#4a6070',
    icon: '⊡',
    layers: ['lift'],
  },
  {
    id: 'deployable-unit',
    name: 'Deployable Unit',
    category: 'Module',
    dims: '5.0 × 5.0 × 3.2 m',
    material: 'Composite frame / steel nodes',
    desc: 'Core spatial unit. Combines floor slab, perimeter walls and connection nodes into one deployable kit.',
    color: '#FFE600',
    icon: '⬡',
    layers: ['deployable model 3'],
  },
]

const _OLD_DEFS_REMOVED = [
  { id: 'DEAD' },
  {
    id: 'rest-room', name: 'Rest Room', units: 2,
    wallSurfaces: 6, size: '6 × 12 m', icon: '▮',
    desc: 'Stacked double bay · Fully enclosed · Deep plan',
    floors: [{c:0,r:0,lv:0},{c:0,r:1,lv:0}],
    walls: [
      {c:0,r:0,lv:0,face:'N'},{c:0,r:0,lv:0,face:'E'},{c:0,r:0,lv:0,face:'W'},
      {c:0,r:1,lv:0,face:'S'},{c:0,r:1,lv:0,face:'E'},{c:0,r:1,lv:0,face:'W'},
    ],
  },
  {
    id: 'corridor', name: 'Corridor', units: 3,
    wallSurfaces: 6, size: '18 × 6 m', icon: '▬',
    desc: 'Linear triple bay · Walled long sides · Open ends',
    floors: [{c:0,r:0,lv:0},{c:1,r:0,lv:0},{c:2,r:0,lv:0}],
    walls: [
      {c:0,r:0,lv:0,face:'N'},{c:1,r:0,lv:0,face:'N'},{c:2,r:0,lv:0,face:'N'},
      {c:0,r:0,lv:0,face:'S'},{c:1,r:0,lv:0,face:'S'},{c:2,r:0,lv:0,face:'S'},
    ],
  },
  {
    id: 'studio', name: 'Individual Studio', units: 3,
    wallSurfaces: 8, size: '12 × 6 m + bay', icon: '⌐',
    desc: 'L-shape · Private enclosed studio space',
    floors: [{c:0,r:0,lv:0},{c:1,r:0,lv:0},{c:1,r:1,lv:0}],
    walls: [
      {c:0,r:0,lv:0,face:'N'},{c:0,r:0,lv:0,face:'S'},{c:0,r:0,lv:0,face:'W'},
      {c:1,r:0,lv:0,face:'N'},{c:1,r:0,lv:0,face:'E'},
      {c:1,r:1,lv:0,face:'S'},{c:1,r:1,lv:0,face:'E'},{c:1,r:1,lv:0,face:'W'},
    ],
  },
  {
    id: 'public-area', name: 'Public Area', units: 4,
    wallSurfaces: 6, size: '12 × 12 m', icon: '⊞',
    desc: '2×2 grid · Open centre · Community space',
    floors: [{c:0,r:0,lv:0},{c:1,r:0,lv:0},{c:0,r:1,lv:0},{c:1,r:1,lv:0}],
    walls: [
      {c:0,r:0,lv:0,face:'N'},{c:1,r:0,lv:0,face:'N'},
      {c:0,r:0,lv:0,face:'W'},{c:0,r:1,lv:0,face:'W'},
      {c:1,r:0,lv:0,face:'E'},{c:1,r:1,lv:0,face:'E'},
    ],
  },
  {
    id: 'gallery', name: 'Gallery', units: 4,
    wallSurfaces: 6, size: '24 × 6 m', icon: '▭',
    desc: 'Quad linear bay · Exhibition hall · Open north face',
    floors: [{c:0,r:0,lv:0},{c:1,r:0,lv:0},{c:2,r:0,lv:0},{c:3,r:0,lv:0}],
    walls: [
      {c:0,r:0,lv:0,face:'W'},{c:3,r:0,lv:0,face:'E'},
      {c:0,r:0,lv:0,face:'S'},{c:1,r:0,lv:0,face:'S'},
      {c:2,r:0,lv:0,face:'S'},{c:3,r:0,lv:0,face:'S'},
    ],
  },
  {
    id: 'auditorium', name: 'Auditorium', units: 6,
    wallSurfaces: 9, size: '18 × 12 m', icon: '⊿',
    desc: 'Stepped 3×2 bays · Two-level amphitheatre section',
    floors: [
      {c:0,r:0,lv:0},{c:1,r:0,lv:0},{c:2,r:0,lv:0},
      {c:0,r:1,lv:0},{c:1,r:1,lv:0},{c:2,r:1,lv:0},
      {c:0,r:1,lv:1},{c:1,r:1,lv:1},
    ],
    walls: [
      {c:0,r:0,lv:0,face:'W'},{c:0,r:1,lv:0,face:'W'},
      {c:2,r:0,lv:0,face:'E'},{c:2,r:1,lv:0,face:'E'},
      {c:0,r:0,lv:0,face:'S'},{c:1,r:0,lv:0,face:'S'},{c:2,r:0,lv:0,face:'S'},
      {c:0,r:1,lv:1,face:'N'},{c:1,r:1,lv:1,face:'N'},
    ],
  },
  {
    id: 'stair-module', name: 'Stair Module', units: 4,
    wallSurfaces: 6, size: '12 × 6 m · 3 levels', icon: '↑',
    desc: 'Vertical circulation · Split-level · 3 storeys',
    floors: [
      {c:0,r:0,lv:0},{c:1,r:0,lv:0},
      {c:0,r:0,lv:1},{c:1,r:0,lv:1},
      {c:0,r:0,lv:2},
    ],
    walls: [
      {c:0,r:0,lv:0,face:'W'},{c:0,r:0,lv:0,face:'S'},
      {c:1,r:0,lv:0,face:'E'},{c:1,r:0,lv:0,face:'S'},
      {c:0,r:0,lv:2,face:'N'},{c:0,r:0,lv:2,face:'W'},
    ],
  },
]

const MOD_UNIT_COUNTS = [2, 3, 4, 6]

// ── module assembly: 3D scene (inside Canvas) ─────────────────────────────────
function ModuleAssemblyScene({ config, animStep }) {
  const N_LOUVERS = 9
  const louverH   = 0.10

  const louverGeo = useMemo(() => new THREE.BoxGeometry(MOD_UNIT - 0.14, louverH, 0.07), [])
  const louverMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a68b8', roughness: 0.28, metalness: 0.18 }), [])
  const slabGeo   = useMemo(() => new THREE.BoxGeometry(MOD_UNIT - 0.12, 0.22, MOD_UNIT - 0.12), [])
  const slabMat   = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c07060', roughness: 0.72 }), [])

  const { avgC, avgR } = useMemo(() => ({
    avgC: config.floors.reduce((s, f) => s + f.c, 0) / config.floors.length,
    avgR: config.floors.reduce((s, f) => s + f.r, 0) / config.floors.length,
  }), [config.id])

  const louverYs = useMemo(() => {
    const ys = [], gap = (MOD_H - N_LOUVERS * louverH) / (N_LOUVERS + 1)
    for (let i = 0; i < N_LOUVERS; i++) ys.push(-MOD_H / 2 + gap * (i + 1) + louverH * (i + 0.5))
    return ys
  }, [])

  const wallGroupRefs = useRef([])
  const progressRef   = useRef(config.walls.map(() => 0))
  const animStepRef   = useRef(animStep)
  const configRef     = useRef(config)
  const avgCRef       = useRef(avgC)
  const avgRRef       = useRef(avgR)

  useEffect(() => { animStepRef.current = animStep }, [animStep])
  useEffect(() => {
    configRef.current = config
    avgCRef.current   = avgC
    avgRRef.current   = avgR
    progressRef.current = config.walls.map(() => 0)
    wallGroupRefs.current = []
  }, [config.id, avgC, avgR])

  useFrame(() => {
    const cfg = configRef.current
    const aC  = avgCRef.current
    const aR  = avgRRef.current
    cfg.walls.forEach((w, i) => {
      const grp = wallGroupRefs.current[i]
      if (!grp) return
      const target = i < animStepRef.current ? 1 : 0
      if (progressRef.current[i] == null) progressRef.current[i] = 0
      progressRef.current[i] = THREE.MathUtils.lerp(progressRef.current[i], target, 0.055)
      const p  = progressRef.current[i]
      const wp = modWallPos(w.c - aC, w.r - aR, w.lv, w.face)
      const od = FACE_OUT[w.face]
      grp.position.set(wp[0] + od[0] * (1 - p) * 14, wp[1], wp[2] + od[2] * (1 - p) * 14)
    })
  })

  return (
    <group>
      {config.floors.map((f, i) => (
        <mesh
          key={`s${i}`}
          geometry={slabGeo}
          material={slabMat}
          position={[(f.c - avgC) * MOD_UNIT, f.lv * MOD_H - 0.08, (f.r - avgR) * MOD_UNIT]}
          receiveShadow castShadow
        />
      ))}
      {config.walls.map((w, i) => (
        <group
          key={`w${i}`}
          ref={el => { wallGroupRefs.current[i] = el }}
          rotation={[0, FACE_ROT_Y[w.face], 0]}
        >
          {louverYs.map((ly, j) => (
            <mesh key={j} geometry={louverGeo} material={louverMat} position={[0, ly, 0]} castShadow />
          ))}
        </group>
      ))}
    </group>
  )
}

// ── catalogue: components sub-tab ─────────────────────────────────────────────
function ComponentsCatalogue({ focusId, onFocus }) {
  const [filter, setFilter] = useState('All')
  const filtered = filter === 'All'
    ? CATALOGUE_MODULES
    : CATALOGUE_MODULES.filter(m => m.category === filter)

  return (
    <>
      <div className="cat-filters">
        {CAT_CATEGORIES.map(c => (
          <button key={c} className={`cat-chip${filter === c ? ' active' : ''}`} onClick={() => setFilter(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="cat-list">
        {filtered.map(m => {
          const isFocused = focusId === m.id
          return (
            <div key={m.id} className={`cat-card${isFocused ? ' focused' : ''}`} onClick={() => onFocus(isFocused ? null : m.id)}>
              <div className="cat-card-top">
                <span className="cat-icon" style={{ color: m.color }}>{m.icon}</span>
                <div className="cat-card-info">
                  <div className="cat-name">{m.name}</div>
                  <div className="cat-cat">{m.category}</div>
                </div>
                {m.layers.length > 0 && <span className="cat-3d-badge">3D</span>}
              </div>
              <div className="cat-dims">{m.dims}</div>
              <div className="cat-material">{m.material}</div>
              <div className="cat-desc">{m.desc}</div>
            </div>
          )
        })}
      </div>
      <div className="panel-footer">
        <div className="stat">
          {focusId
            ? `Showing: ${CATALOGUE_MODULES.find(m => m.id === focusId)?.name}`
            : `${filtered.length} module${filtered.length !== 1 ? 's' : ''}`}
        </div>
      </div>
    </>
  )
}

// ── catalogue: assembly sub-tab ───────────────────────────────────────────────
function ModuleLibrary({ unitCount, onUnitCount, modConfigId, onModConfig, modStep, onPlay, onReset }) {
  const available = MODULE_DEFS.filter(m => m.units === unitCount)
  const selDef    = modConfigId ? MODULE_DEFS.find(m => m.id === modConfigId) : null
  const total     = selDef ? selDef.walls.length : 0
  const allIn     = modStep >= total && total > 0

  return (
    <div className="mod-lib">
      <div className="mod-section">
        <div className="mod-slabel">UNIT COUNT</div>
        <div className="mod-unit-row">
          {MOD_UNIT_COUNTS.map(n => (
            <button
              key={n}
              className={`mod-unit-btn${unitCount === n ? ' active' : ''}`}
              onClick={() => { onUnitCount(n); onModConfig(null) }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mod-unit-hint">{unitCount} × 6 m units · {unitCount * MOD_UNIT * MOD_UNIT} m² max</div>
      </div>

      <div className="mod-section mod-configs-section">
        <div className="mod-slabel">POSSIBLE LAYOUTS · {available.length}</div>
        {available.length === 0 && (
          <div className="mod-empty">No configurations for {unitCount} units yet.</div>
        )}
        {available.map(m => {
          const isSel = modConfigId === m.id
          return (
            <div key={m.id} className={`mod-card${isSel ? ' active' : ''}`} onClick={() => onModConfig(isSel ? null : m.id)}>
              <div className="mod-card-top">
                <span className="mod-icon">{m.icon}</span>
                <div className="mod-card-info">
                  <div className="mod-name">{m.name}</div>
                  <div className="mod-size">{m.size}</div>
                </div>
                <span className="mod-walls-badge">{m.wallSurfaces}W</span>
              </div>
              <div className="mod-desc">{m.desc}</div>
            </div>
          )
        })}
      </div>

      {selDef ? (
        <div className="mod-section mod-ctrl-section">
          <div className="mod-slabel">ASSEMBLY · {modStep}/{total} walls</div>
          <div className="mod-ctrl-row">
            <button className="mod-btn mod-play" onClick={onPlay} disabled={allIn}>
              {allIn ? '✓ Complete' : '▶ Animate'}
            </button>
            <button className="mod-btn mod-reset" onClick={onReset} title="Reset">↺</button>
          </div>
          <div className="mod-prog-bar">
            <div className="mod-prog-fill" style={{ width: total > 0 ? `${(modStep / total) * 100}%` : '0%' }} />
          </div>
          <div className="mod-prog-txt">
            {modStep === 0
              ? `${total} walls · press ▶ to assemble`
              : allIn ? 'Assembly complete · drag to inspect'
              : `${modStep} / ${total} walls placed`}
          </div>
        </div>
      ) : (
        <div className="mod-idle">
          <div className="mod-idle-icon">↗</div>
          <div className="mod-idle-txt">Select a layout above<br />to see its 3D assembly</div>
        </div>
      )}
    </div>
  )
}

// ── (dead old panel — replaced by new CataloguePanel above) ──────────────────
function _DeadCataloguePanel({ focusId, onFocus, catSubTab, onSubTab, unitCount, onUnitCount, modConfigId, onModConfig, modStep, onModPlay, onModReset }) {
  return (
    <div className="panel cat-panel">
      <div className="panel-header">
        <div className="panel-logo">Rewire</div>
        <div className="panel-subtitle">Module Catalogue</div>
      </div>

      <div className="cat-subtabs">
        <button className={`cat-stab${catSubTab === 'components' ? ' active' : ''}`} onClick={() => onSubTab('components')}>
          Components
        </button>
        <button className={`cat-stab${catSubTab === 'assembly' ? ' active' : ''}`} onClick={() => onSubTab('assembly')}>
          Assembly
        </button>
      </div>

      {catSubTab === 'components' ? (
        <ComponentsCatalogue focusId={focusId} onFocus={onFocus} />
      ) : (
        <ModuleLibrary
          unitCount={unitCount}
          onUnitCount={onUnitCount}
          modConfigId={modConfigId}
          onModConfig={onModConfig}
          modStep={modStep}
          onPlay={onModPlay}
          onReset={onModReset}
        />
      )}
    </div>
  )
}

/* END_DEAD_BLOCK */

// ── layer grouping ────────────────────────────────────────────────────────────
const LAYER_GROUPS = [
  {
    title: 'Floors',
    keys: ['Floor G', 'floor 1', 'floor 2', 'floor 3', 'floor 4', 'floor 5'],
  },
  {
    title: 'Stay Rooms',
    keys: ['stayroom floor 1', 'stayroom floor 2', 'stayroom floor 3'],
  },
  {
    title: 'Deployable Modules',
    keys: ['deployable model 3', 'benches module', 'balconies module', 'OAT module'],
  },
  {
    title: 'Structure',
    keys: ['walls 2', 'walls 3', 'columns'],
  },
  {
    title: 'Circulation',
    keys: ['stairs', 'staircase', 'lift'],
  },
  {
    title: 'Services',
    keys: ['kitchen floor', 'service'],
  },
  {
    title: 'Interior',
    keys: ['furniture'],
  },
  {
    title: 'Landscaping',
    keys: ['green pots'],
  },
]

function pretty(name) {
  // preserve existing capitalisation, just clean underscores
  return name.replace(/_/g, ' ')
}

// ── style / scheme picker ─────────────────────────────────────────────────────
function StylePicker({ options, value, onChange, title }) {
  return (
    <div className="style-picker">
      <div className="style-picker-title">{title}</div>
      <div className="style-picker-row">
        {Object.entries(options).map(([key, opt]) => (
          <button
            key={key}
            className={`style-pill${value === key ? ' active' : ''}`}
            onClick={() => onChange(key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── mode toggle ───────────────────────────────────────────────────────────────
function ModeToggle({ mode, onMode }) {
  return (
    <div className="mode-toggle">
      <button
        className={`mode-btn ${mode === 'editor' ? 'active' : ''}`}
        onClick={() => onMode('editor')}
      >
        Editor
      </button>
      <button
        className={`mode-btn ${mode === 'viewer' ? 'active' : ''}`}
        onClick={() => onMode('viewer')}
      >
        Viewer
      </button>
      <button
        className={`mode-btn ${mode === 'explore' ? 'active' : ''}`}
        onClick={() => onMode('explore')}
      >
        Explore
      </button>
    </div>
  )
}

// ── view-mode toggle (plan / iso / catalogue) ─────────────────────────────────
function ViewToggle({ viewMode, setViewMode, showCatalogue = true }) {
  return (
    <div className="view-toggle">
      <button
        className={`view-btn ${viewMode === 'plan' ? 'active' : ''}`}
        onClick={() => setViewMode('plan')}
      >
        Plan
      </button>
      <button
        className={`view-btn ${viewMode === 'iso' ? 'active' : ''}`}
        onClick={() => setViewMode('iso')}
      >
        Iso
      </button>
      {showCatalogue && (
        <button
          className={`view-btn ${viewMode === 'catalogue' ? 'active' : ''}`}
          onClick={() => setViewMode('catalogue')}
        >
          Catalogue
        </button>
      )}
    </div>
  )
}

// floors that have stayroom units (layers: stayroom floor 1/2/3)
const STAYROOM_FLOORS = new Set([1, 2, 3])

// ── sidebar panel ─────────────────────────────────────────────────────────────
function Panel({ layers, visible, setVisible, activeFloor, setActiveFloor, onFloorSelect }) {
  const nonFloorLayers = layers.filter(l => !FLOOR_LAYER_KEYS.has(l.layer))
  const allNonFloorOn  = nonFloorLayers.every(l => visible[l.layer] !== false)

  const toggleAll = () => {
    const next = {}
    layers.forEach((l) => (next[l.layer] = !allNonFloorOn))
    setVisible((v) => ({ ...v, ...next }))
  }

  const toggleGroup = (keys) => {
    const groupLayers = layers.filter((l) => keys.includes(l.layer))
    const anyOn = groupLayers.some((l) => visible[l.layer] !== false)
    const next = {}
    groupLayers.forEach((l) => (next[l.layer] = !anyOn))
    setVisible((v) => ({ ...v, ...next }))
  }

  const colorMap = {}
  layers.forEach((l) => (colorMap[l.layer] = l.color))

  const toHex = (c) => c
    ? `#${c[0].toString(16).padStart(2,'0')}${c[1].toString(16).padStart(2,'0')}${c[2].toString(16).padStart(2,'0')}`
    : '#888'

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-logo">Rewire</div>
        <div className="panel-subtitle">Wolfsburg · Deployable Modules</div>
      </div>

      <div className="master-row">
        <button className="master-btn" onClick={toggleAll}>
          {allNonFloorOn ? 'Hide all' : 'Show all'}
        </button>
      </div>

      <div className="layer-list">
        {LAYER_GROUPS.map((grp) => {
          const present = grp.keys.filter((k) => colorMap[k] !== undefined)
          if (present.length === 0) return null
          const isFloorGrp = grp.title === 'Floors'

          return (
            <div className="layer-group" key={grp.title}>
              <button
                className="group-header"
                onClick={() => isFloorGrp ? setActiveFloor(null) : toggleGroup(present)}
                title={isFloorGrp && activeFloor ? 'Show all floors' : undefined}
              >
                {grp.title}
                {isFloorGrp && activeFloor && <span className="floor-reset-chip">all</span>}
              </button>

              {present.map((key) => {
                const c   = colorMap[key]
                const hex = toHex(c)

                if (isFloorGrp) {
                  const isSel    = activeFloor === key
                  const isDim    = activeFloor && activeFloor !== key
                  const flIdx    = BKG_FLOOR_KEYS.indexOf(key)
                  const hasSR    = STAYROOM_FLOORS.has(flIdx)
                  return (
                    <div
                      key={key}
                      className={`layer-row floor-row${isSel ? ' floor-sel' : isDim ? ' floor-dim' : ''}`}
                      onClick={() => {
                        setActiveFloor(prev => prev === key ? null : key)
                        if (flIdx >= 0 && onFloorSelect) onFloorSelect(flIdx)
                      }}
                    >
                      <span className="swatch" style={{ background: hex, opacity: isDim ? 0.25 : 1 }} />
                      <span className="layer-name">{pretty(key)}</span>
                      {hasSR && <span className="floor-sr-dot" title="Stay rooms available" />}
                      {isSel && <span className="floor-sel-dot" />}
                    </div>
                  )
                }

                // non-floor groups — normal on/off toggle
                const on = visible[key] !== false
                return (
                  <div
                    key={key}
                    className={`layer-row ${on ? 'on' : 'off'}`}
                    onClick={() => setVisible((v) => ({ ...v, [key]: !on }))}
                  >
                    <span className="swatch" style={{ background: hex, opacity: on ? 1 : 0.3 }} />
                    <span className="layer-name">{pretty(key)}</span>
                    <span className={`toggle ${on ? 'toggle-on' : ''}`} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="panel-footer">
        <div className="stat">
          {activeFloor
            ? `Showing: ${pretty(activeFloor)}`
            : `${layers.filter((l) => visible[l.layer] !== false).length} / ${layers.length} layers visible`}
        </div>
      </div>
    </div>
  )
}

// ── app ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]           = useState(null)
  const [visible, setVisible]     = useState({})
  const [activeFloor, setActiveFloor] = useState(null)  // floor layer key, or null = all
  const [mode, setMode]           = useState('editor')
  const [viewMode, setViewMode]   = useState('plan')
  const [hovered, setHovered]     = useState(null)

  // booking state
  const [bkgFloor,    setBkgFloor]    = useState(0)
  const [bkgSel,      setBkgSel]      = useState(new Set())
  const [bkgBookings, setBkgBookings] = useState(bkgLoad)

  // assembly state
  const [assemblyId,   setAssemblyId]   = useState(null)
  const [assemblyStep, setAssemblyStep] = useState(0)
  const [wallTypes,    setWallTypes]    = useState({})  // { [bookingId]: { [wallId]: type } }
  const [activeWallId, setActiveWallId] = useState(null)
  const assemblyTimer = useRef(null)

  // catalogue state
  const [catModConfigId,      setCatModConfigId]      = useState(null)
  const [catModStep,          setCatModStep]          = useState(0)
  const [catPreviewWallTypes, setCatPreviewWallTypes] = useState({})
  const [catActiveWallId,     setCatActiveWallId]     = useState(null)
  const [catLevelCount,       setCatLevelCount]       = useState(1)
  const [catWallComboId,      setCatWallComboId]      = useState(null)
  const [catInteriorComboId,  setCatInteriorComboId]  = useState(null)
  const [catRoofEnabled,      setCatRoofEnabled]      = useState(false)
  const [catRoofInflation,    setCatRoofInflation]    = useState(0)
  const [roofMorphData,       setRoofMorphData]       = useState(null)
  const [viewerStyleKey,      setViewerStyleKey]      = useState('arctic')
  const [editorSchemeKey,     setEditorSchemeKey]     = useState('cyber')
  const captureRef = useRef(null)

  const handleDownload = (format) => {
    if (!captureRef.current) return
    const { capture, camera } = captureRef.current
    let sceneUrl
    try { sceneUrl = capture(format) } catch { return }

    const img = new Image()
    img.onload = () => {
      try {
        const W  = img.width
        const iH = img.height
        const s  = W / 1920
        const STRIP = Math.round(110 * s)

        const offscreen = document.createElement('canvas')
        offscreen.width  = W
        offscreen.height = iH + STRIP
        const ctx = offscreen.getContext('2d')

        // 3-D render
        ctx.drawImage(img, 0, 0)

        // ── booking name labels ─────────────────────────────────────────────
        if (camera) {
          const glowColor = viewerStyle.glowEdge
          bkgBookings.forEach(booking => {
            try {
              const floorIdx = booking.floor
              const isStay   = STAY_ROOM_FLOOR_SET.has(floorIdx)
              const xs = [], zs = []
              for (const cellId of (booking.cells || [])) {
                if (isStay) {
                  const room = srRoomById(floorIdx, cellId)
                  if (room) {
                    const [px,,pz] = roomThreePos(room, floorIdx)
                    xs.push(px); zs.push(pz)
                  }
                } else {
                  const [r, c] = cellId.split('-').map(Number)
                  const [px,,pz] = bkgPos(r, c, floorIdx)
                  xs.push(px); zs.push(pz)
                }
              }
              if (!xs.length) return
              const cx = xs.reduce((a, x) => a + x, 0) / xs.length
              const cz = zs.reduce((a, z) => a + z, 0) / zs.length
              const cy = bkgPos(0, 0, floorIdx)[1] + FLOOR_H_M + 2.5

              const v = new THREE.Vector3(cx, cy, cz).project(camera)
              if (v.z > 1) return
              const lsx = (v.x + 1) / 2 * W
              const lsy = -(v.y - 1) / 2 * iH
              if (lsx < 10 || lsx > W - 10 || lsy < 10 || lsy > iH - 10) return

              const userName = booking.userName || 'Booking'
              const activity = booking.activity || ''
              const floorLbl = BKG_FLOORS[floorIdx]?.label || `F${floorIdx}`

              const fName  = Math.round(13 * s)
              const fAct   = Math.round(10 * s)
              const fFloor = Math.round(8 * s)
              const lh     = Math.round(17 * s)
              const bpad   = Math.round(11 * s)

              ctx.font = `800 ${fName}px system-ui, sans-serif`
              const nW = ctx.measureText(userName).width
              ctx.font = `500 ${fAct}px system-ui, sans-serif`
              const aW = activity ? ctx.measureText(activity).width : 0
              ctx.font = `700 ${fFloor}px system-ui, sans-serif`
              const fW = ctx.measureText(floorLbl).width

              const boxW = Math.max(nW, aW, fW) + bpad * 2
              const rows = 1 + (activity ? 1 : 0) + 1
              const boxH = rows * lh + bpad * 1.4
              const bx   = lsx - boxW / 2
              const by   = lsy - boxH - Math.round(10 * s)

              // background
              ctx.fillStyle = 'rgba(2,4,14,0.93)'
              ctx.fillRect(bx, by, boxW, boxH)

              // border
              ctx.strokeStyle = glowColor
              ctx.lineWidth = Math.max(1, Math.round(1.5 * s))
              ctx.strokeRect(bx, by, boxW, boxH)

              // connector line
              ctx.save()
              ctx.globalAlpha = 0.4
              ctx.strokeStyle = glowColor
              ctx.lineWidth = Math.max(1, Math.round(s))
              ctx.beginPath()
              ctx.moveTo(lsx, by + boxH)
              ctx.lineTo(lsx, lsy)
              ctx.stroke()
              ctx.restore()

              // user name
              ctx.textAlign  = 'center'
              ctx.shadowColor = glowColor
              ctx.shadowBlur  = Math.round(8 * s)
              ctx.font        = `800 ${fName}px system-ui, sans-serif`
              ctx.fillStyle   = '#ffffff'
              let ty = by + bpad + fName
              ctx.fillText(userName, lsx, ty)
              ctx.shadowBlur = 0

              if (activity) {
                ty += lh
                ctx.font      = `500 ${fAct}px system-ui, sans-serif`
                ctx.fillStyle = glowColor
                ctx.fillText(activity, lsx, ty)
              }

              ty += lh
              ctx.font      = `700 ${fFloor}px system-ui, sans-serif`
              ctx.fillStyle = 'rgba(255,255,255,0.45)'
              ctx.fillText(floorLbl, lsx, ty)

              ctx.textAlign  = 'left'
              ctx.shadowBlur = 0
            } catch { /* skip this label, don't break download */ }
          })
        }

        // ── template strip ──────────────────────────────────────────────────
        ctx.fillStyle = '#080C1A'
        ctx.fillRect(0, iH, W, STRIP)

        ctx.fillStyle = '#F72585'
        ctx.fillRect(0, iH, W, Math.max(2, Math.round(2 * s)))

        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(Math.round(W * 0.5), iH + Math.round(16 * s), Math.max(1, Math.round(s)), STRIP - Math.round(28 * s))

        const pad      = Math.round(32 * s)
        const baseLine = iH + Math.round(40 * s)
        const rpad     = W - pad

        ctx.textAlign = 'left'
        ctx.font      = `800 ${Math.round(22 * s)}px system-ui, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.fillText('THIRD HOME WOLFSBURG', pad, baseLine)

        ctx.font      = `500 ${Math.round(12 * s)}px system-ui, sans-serif`
        ctx.fillStyle = '#4CC9F0'
        ctx.fillText('REWIRE WOLFSBURG INTERFACE', pad, baseLine + Math.round(24 * s))

        ctx.font      = `400 ${Math.round(11 * s)}px system-ui, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.35)'
        ctx.fillText(new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }), pad, baseLine + Math.round(48 * s))

        ctx.textAlign = 'right'
        ctx.font      = `700 ${Math.round(11 * s)}px system-ui, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.40)'
        ctx.fillText('BOOKING CONFIRMATION', rpad, baseLine - Math.round(6 * s))

        bkgBookings.forEach((b, i) => {
          const fl  = BKG_FLOORS[b.floor]?.label || `F${b.floor}`
          const line = [b.userName, b.activity, fl].filter(Boolean).join('  ·  ')
          ctx.font      = `600 ${Math.round(14 * s)}px system-ui, sans-serif`
          ctx.fillStyle = '#ffffff'
          ctx.fillText(line, rpad, baseLine + Math.round((14 + i * 22) * s))
        })

        const a     = document.createElement('a')
        const names = bkgBookings.map(b => b.userName).filter(Boolean).join('-') || 'viewer'
        a.download  = `third-home-wolfsburg_${names}.${format}`
        a.href      = offscreen.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95)
        a.click()
      } catch (e) { console.error('download failed', e) }
    }
    img.src = sceneUrl
  }
  const catModTimer = useRef(null)

  // derive catalogue context: prefer live bkgSel, fall back to the active assembly booking
  const assemblyBooking = assemblyId ? bkgBookings.find(b => b.id === assemblyId) : null
  const catCells = useMemo(() => {
    if (bkgSel.size > 0) return bkgSel
    if (assemblyBooking) return new Set(assemblyBooking.cells)
    return new Set()
  }, [bkgSel, assemblyBooking])
  const catFloor = useMemo(() => {
    if (bkgSel.size > 0) return bkgFloor
    if (assemblyBooking) return assemblyBooking.floor
    return bkgFloor
  }, [bkgSel, bkgFloor, assemblyBooking])

  // floors involved in preview: catFloor through catFloor+catLevelCount-1, capped at 5
  const catPreviewFloors = useMemo(
    () => Array.from({ length: catLevelCount }, (_, i) => Math.min(catFloor + i, 5)),
    [catFloor, catLevelCount]
  )

  // perimeter walls on the base floor (used for animation step count + right panel)
  const catPreviewWalls = useMemo(
    () => catModConfigId && catCells.size > 0 ? getPerimeterWalls([...catCells], catFloor) : [],
    [catModConfigId, catCells, catFloor]
  )

  // per-cell positions in three.js space — fed to FloatingCubes for settle targets
  const floatSelCells = useMemo(() => {
    // during assembly use the booked cells (bkgSel is cleared after booking)
    if (assemblyId && assemblyBooking) {
      return assemblyBooking.cells.map(id => {
        const [r, c] = id.split('-').map(Number)
        return bkgPos(r, c, assemblyBooking.floor)
      })
    }
    if (bkgSel.size > 0) {
      return [...bkgSel].map(id => {
        const [r, c] = id.split('-').map(Number)
        return bkgPos(r, c, bkgFloor)
      })
    }
    return []
  }, [bkgSel, bkgFloor, assemblyId, assemblyBooking])

  const handleMode = (m) => {
    setMode(m)
    if (m === 'editor') setViewMode('plan')
    if (m === 'viewer') setViewMode('iso')
    setCatModConfigId(null)
    setCatPreviewWallTypes({})
    setCatActiveWallId(null)
    setCatLevelCount(1)
    clearInterval(catModTimer.current)
    setCatModStep(0)
    setCatWallComboId(null)
    setCatInteriorComboId(null)
  }

  const handleViewMode = (vm) => {
    setViewMode(vm)
    if (vm === 'plan' && mode === 'editor') {
      // switching back to plan exits assembly mode so booking cells become clickable again
      clearInterval(assemblyTimer.current)
      setAssemblyId(null)
      setAssemblyStep(0)
      setActiveWallId(null)
    }
    if (vm !== 'catalogue') {
      setCatModConfigId(null)
      setCatPreviewWallTypes({})
      setCatActiveWallId(null)
      setCatLevelCount(1)
      clearInterval(catModTimer.current)
      setCatModStep(0)
      setCatWallComboId(null)
      setCatInteriorComboId(null)
    }
  }

  const handleModConfig = (id) => {
    clearInterval(catModTimer.current)
    setCatModConfigId(id)
    setCatModStep(0)
    setCatPreviewWallTypes({})
    setCatActiveWallId(null)
    setCatWallComboId(null)
    setCatInteriorComboId(null)
  }

  const handleModPlay = () => {
    if (!catModConfigId) return
    clearInterval(catModTimer.current)
    const total = catPreviewWalls.length
    let step = catModStep
    catModTimer.current = setInterval(() => {
      step++
      setCatModStep(step)
      if (step >= total) clearInterval(catModTimer.current)
    }, 520)
  }

  const handleModReset = () => {
    clearInterval(catModTimer.current)
    setCatModStep(0)
  }

  const setCatPreviewWallType = (wallId, type) => {
    setCatPreviewWallTypes(prev => ({ ...prev, [wallId]: type }))
    setCatWallComboId(null)
  }

  const handleSetBookingRoof = (bookingId, enabled, inflation) => {
    setBkgBookings(prev => prev.map(b => {
      if (b.id !== bookingId) return b
      const updated = { ...b, roofEnabled: enabled, roofInflation: inflation }
      bkgUpdate(updated)
      return updated
    }))
  }

  const applyWallCombo = (comboId) => {
    const combo = WALL_COMBOS.find(c => c.id === comboId)
    if (!combo || catPreviewWalls.length === 0) return
    setCatWallComboId(comboId)
    const extTypes = Object.fromEntries(
      catPreviewWalls.map(w => [w.id, combo.sides[w.side] || 'solid'])
    )
    setCatPreviewWallTypes(prev => ({
      ...Object.fromEntries(Object.entries(prev).filter(([k]) => k.startsWith('int-'))),
      ...extTypes,
    }))
  }

  const applyInteriorCombo = (comboId) => {
    const combo = INTERIOR_COMBOS.find(c => c.id === comboId)
    if (!combo) return
    setCatInteriorComboId(comboId)
    const intWalls = getInteriorWalls([...catCells], catFloor)
    const intTypes = Object.fromEntries(
      intWalls.map((w, i) => [`int-${w.id}`, combo.filter(w, i)])
    )
    setCatPreviewWallTypes(prev => ({
      ...Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('int-'))),
      ...intTypes,
    }))
  }

  const assemblyWalls   = useMemo(
    () => assemblyBooking ? getPerimeterWalls(assemblyBooking.cells, assemblyBooking.floor) : [],
    [assemblyId, bkgBookings]
  )

  const toggleBkgCell  = (id) => {
    setBkgSel(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const clearBkgSel    = () => setBkgSel(new Set())
  const switchBkgFloor = (i) => { setBkgFloor(i); setBkgSel(new Set()) }

  const startAssembly = (bookingId) => {
    clearInterval(assemblyTimer.current)
    setAssemblyId(bookingId)
    setAssemblyStep(0)
    setActiveWallId(null)
    setViewMode('iso')  // switch to iso so walls are visible in 3D
  }
  const closeAssembly = () => {
    clearInterval(assemblyTimer.current)
    setAssemblyId(null)
    setAssemblyStep(0)
    setActiveWallId(null)
  }
  const playAssembly = () => {
    clearInterval(assemblyTimer.current)
    const total = assemblyWalls.length
    let step = assemblyStep
    assemblyTimer.current = setInterval(() => {
      step++
      setAssemblyStep(step)
      if (step >= total) clearInterval(assemblyTimer.current)
    }, 550)
  }
  const resetAssembly = () => {
    clearInterval(assemblyTimer.current)
    setAssemblyStep(0)
  }
  const setWallType = (wallId, type) => {
    setWallTypes(prev => ({
      ...prev,
      [assemblyId]: { ...(prev[assemblyId] || {}), [wallId]: type }
    }))
  }

  useEffect(() => {
    fetch('./model.json')
      .then((r) => r.json())
      .then((d) => {
        setData(d)
        // these layers clutter the booking/selection view — start hidden, user can toggle on
        const OFF_BY_DEFAULT = new Set([
          'walls 2', 'walls 3',
          'stairs', 'staircase', 'lift',
          'deployable model 3', 'benches module', 'balconies module', 'OAT module',
          'stayroom floor 1', 'stayroom floor 2', 'stayroom floor 3',
          'service',
        ])
        const init = {}
        d.statics.forEach((s) => (init[s.layer] = !OFF_BY_DEFAULT.has(s.layer)))
        setVisible(init)
      })
  }, [])

  const layers = useMemo(() => {
    if (!data) return []
    const seen = {}
    data.statics.forEach((s) => { if (!seen[s.layer]) seen[s.layer] = s.color })
    return Object.entries(seen).map(([layer, color]) => ({ layer, color }))
  }, [data])

  useEffect(() => {
    fetch('./roof_morph.json')
      .then(r => r.json())
      .then(d => setRoofMorphData(d))
      .catch(() => {})
  }, [])

  const hintText = {
    viewer:    'Drag to orbit · scroll to zoom · right-drag to pan',
    plan:      'Plan view · scroll to zoom · drag to pan · no rotation',
    iso:       'Iso view · drag to orbit · scroll to zoom · right-drag to pan',
    catalogue: 'Catalogue · select cells in Plan / Iso first, then choose a layout',
  }
  const activeHint = mode === 'viewer'
    ? (viewMode === 'plan' ? hintText.plan : hintText.iso)
    : (mode === 'editor' ? hintText[viewMode] : hintText.viewer)

  // cameraKey drives full remount of SceneCamera (camera + OrbitControls)
  // so OrbitControls always re-attaches to the correct camera type
  const cameraKey = `${mode}-${viewMode}`

  const isCatView    = mode === 'editor' && viewMode === 'catalogue'
  const viewerStyle  = VIEWER_STYLES[viewerStyleKey]  || VIEWER_STYLES.arctic
  const editorScheme = editorSchemeKey

  return (
    <div className="app" data-mode={mode} data-view={viewMode}>

      {/* ── Exhibition / Explore mode ── */}
      {mode === 'explore' && (
        <SemanticZoomScene onClose={() => handleMode('editor')} />
      )}

      {/* ── Main canvas (hidden in explore mode) ── */}
      <div className="canvas-wrap" style={{ display: mode === 'explore' ? 'none' : undefined }}>
        <Canvas shadows gl={{ antialias: true, preserveDrawingBuffer: true }}>
          <color attach="background" args={['#080C1A']} />
          <hemisphereLight intensity={0.5} skyColor="#4CC9F0" groundColor="#1A0533" />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[300, 400, 300]}
            intensity={2.2}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-near={1}
            shadow-camera-far={2000}
            shadow-camera-left={-600}
            shadow-camera-right={600}
            shadow-camera-top={600}
            shadow-camera-bottom={-600}
            shadow-bias={-0.001}
          />

          {/* key forces full remount on every mode/viewMode change */}
          <SceneCamera key={cameraKey} mode={mode} viewMode={viewMode} />
          <CanvasCapture captureRef={captureRef} />

          {mode === 'editor' && !isCatView && <EditorGrid />}

          {mode === 'editor' && (
            <FloatingCubes selCells={floatSelCells} assembling={!!assemblyId} />
          )}

          {mode === 'editor' && !isCatView && !assemblyId && (
            STAY_ROOM_FLOOR_SET.has(bkgFloor)
              ? <StayRoomCells floor={bkgFloor} sel={bkgSel} bookings={bkgBookings} onToggle={toggleBkgCell} scheme={editorScheme} />
              : <BookingCells  floor={bkgFloor} sel={bkgSel} bookings={bkgBookings} onToggle={toggleBkgCell} scheme={editorScheme} />
          )}

          {mode === 'editor' && !isCatView && assemblyBooking && assemblyId && (
            <AssemblyGeometry
              key={assemblyId}
              booking={assemblyBooking}
              wallTypesMap={wallTypes[assemblyId] || {}}
              activeWallId={activeWallId}
              onSelectWall={setActiveWallId}
              animStep={assemblyStep}
              roofEnabled={assemblyBooking.roofEnabled ?? false}
              roofMorphData={roofMorphData}
              roofInflation={assemblyBooking.roofInflation ?? 0}
            />
          )}

          {isCatView && catModConfigId && catCells.size > 0 && catPreviewFloors.map(floorIdx => (
            <AssemblyGeometry
              key={`cat-${catModConfigId}-${floorIdx}`}
              booking={{ id: `cat-preview-${floorIdx}`, cells: [...catCells], floor: floorIdx }}
              wallTypesMap={catPreviewWallTypes}
              activeWallId={catActiveWallId}
              onSelectWall={setCatActiveWallId}
              animStep={catModStep}
              roofEnabled={catRoofEnabled}
              roofMorphData={roofMorphData}
              roofInflation={catRoofInflation}
            />
          ))}

          {/* viewer mode: render every booking's assembled walls + roofs */}
          {mode === 'viewer' && bkgBookings.map(b => (
            <AssemblyGeometry
              key={b.id}
              booking={b}
              wallTypesMap={wallTypes[b.id] || {}}
              activeWallId={null}
              onSelectWall={() => {}}
              animStep={999}
              roofEnabled={b.roofEnabled ?? false}
              roofMorphData={roofMorphData}
              roofInflation={b.roofInflation ?? 0}
            />
          ))}

          {data && (
            <Model
              data={data}
              visible={visible}
              activeFloor={isCatView ? BKG_FLOOR_KEYS[catFloor] : activeFloor}
              focusLayers={null}
              mode={mode}
              hovered={hovered}
              onHover={setHovered}
              viewerOpacity={viewerStyle.modelOpacity}
              colorOverride={viewerStyle.colorOverride}
            />
          )}

          {/* viewer mode: glowing cell highlights drawn last so they always show through building */}
          {mode === 'viewer' && bkgBookings.length > 0 && (
            <ViewerBookedGlow bookings={bkgBookings} glowFill={viewerStyle.glowFill} glowEdge={viewerStyle.glowEdge} />
          )}
        </Canvas>
      </div>

      {data && (mode === 'viewer' || (!isCatView && mode === 'editor')) && (
        <Panel
          layers={layers}
          visible={visible}
          setVisible={setVisible}
          activeFloor={activeFloor}
          setActiveFloor={setActiveFloor}
          onFloorSelect={switchBkgFloor}
        />
      )}

      {data && isCatView && (
        <CataloguePanel
          catFloor={catFloor}
          catCells={catCells}
          levelCount={catLevelCount}
          onLevelCount={setCatLevelCount}
          modConfigId={catModConfigId}
          onModConfig={handleModConfig}
        />
      )}

      {data && isCatView && (
        <CatalogueRightPanel
          modConfigId={catModConfigId}
          onClose={() => handleModConfig(null)}
          catFloor={catFloor}
          catCells={catCells}
          levelCount={catLevelCount}
          assemblyWalls={catPreviewWalls}
          animStep={catModStep}
          wallTypes={catPreviewWallTypes}
          activeWallId={catActiveWallId}
          onPlay={handleModPlay}
          onReset={handleModReset}
          onSetWallType={setCatPreviewWallType}
          onSelectWall={setCatActiveWallId}
          wallComboId={catWallComboId}
          onApplyCombo={applyWallCombo}
          interiorComboId={catInteriorComboId}
          onApplyInteriorCombo={applyInteriorCombo}
          roofEnabled={catRoofEnabled}
          roofInflation={catRoofInflation}
          onToggleRoof={() => setCatRoofEnabled(v => !v)}
          onSetRoofInflation={setCatRoofInflation}
          hasMorphData={!!roofMorphData}
        />
      )}

      {mode === 'editor' && !isCatView && data && (
        <BookingRightPanel
          floor={bkgFloor}
          onFloor={switchBkgFloor}
          sel={bkgSel}
          onToggle={toggleBkgCell}
          onClearSel={clearBkgSel}
          bookings={bkgBookings}
          onBookings={setBkgBookings}
          assemblyId={assemblyId}
          assemblyWalls={assemblyWalls}
          assemblyStep={assemblyStep}
          wallTypes={wallTypes[assemblyId] || {}}
          activeWallId={activeWallId}
          onStartAssembly={startAssembly}
          onCloseAssembly={closeAssembly}
          onPlayAssembly={playAssembly}
          onResetAssembly={resetAssembly}
          onSetWallType={setWallType}
          onSelectWall={setActiveWallId}
          roofMorphData={roofMorphData}
          onSetRoof={handleSetBookingRoof}
        />
      )}

      {!data && (
        <div className="loading">
          <div className="loading-dot" />
          Loading model…
        </div>
      )}

      {mode !== 'explore' && <ModeToggle mode={mode} onMode={handleMode} />}

      {mode !== 'explore' && (
        <ViewToggle
          viewMode={viewMode}
          setViewMode={handleViewMode}
          showCatalogue={mode === 'editor'}
        />
      )}

      {mode === 'viewer' && (
        <StylePicker
          title="Render Style"
          options={VIEWER_STYLES}
          value={viewerStyleKey}
          onChange={setViewerStyleKey}
        />
      )}

      {mode === 'viewer' && (
        <div className="viewer-export-panel">
          <div className="viewer-export-title">Export View</div>
          <div className="viewer-export-btns">
            <button className="viewer-export-btn" onClick={() => handleDownload('png')}>PNG</button>
            <button className="viewer-export-btn" onClick={() => handleDownload('jpg')}>JPG</button>
          </div>
        </div>
      )}

      {mode === 'editor' && !isCatView && (
        <StylePicker
          title="Colour Scheme"
          options={EDITOR_SCHEMES}
          value={editorSchemeKey}
          onChange={setEditorSchemeKey}
        />
      )}

      {mode !== 'explore' && <div className="hint">{activeHint}</div>}

      {/* Explore mode: show mode toggle floating above SemanticZoomScene */}
      {mode === 'explore' && (
        <div className="szs-mode-back">
          <ModeToggle mode={mode} onMode={handleMode} />
        </div>
      )}
    </div>
  )
}

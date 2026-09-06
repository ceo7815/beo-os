import { Link, useNavigate } from 'react-router-dom'
import { getAgentProfile, loadAgentAvatar } from '../../lib/aiAgentProfiles'
import type { AiAgentBoardDef } from '../../lib/aiAgentsRegistry'
import type { FleetAgent } from '../../lib/aiAgentsFleet'
import { displayToolsForAgent } from '../../lib/aiAgentsDisplay'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

export type FleetGraphCard = {
  board: AiAgentBoardDef
  agent: FleetAgent | null
  mode: 'fleet' | 'planned' | 'unavailable'
  statusLabel: string
}

type NodeId = 'company' | 'johnny-beo' | 'leads-beo' | 'social-beo'
type PctPos = { x: number; y: number }
type NodeState = 'on' | 'off' | 'warn'
type Center = { x: number; y: number; r: number }

const LAYOUT_KEY = 'beo-os:agent-mesh-layout:v1'
const LONG_PRESS_MS = 420

const DEFAULT_LAYOUT: Record<NodeId, PctPos> = {
  company: { x: 50, y: 6 },
  'johnny-beo': { x: 50, y: 32 },
  'leads-beo': { x: 18, y: 68 },
  'social-beo': { x: 82, y: 68 },
}

const EDGES: { from: NodeId; to: NodeId; label: string }[] = [
  { from: 'company', to: 'johnny-beo', label: 'command' },
  { from: 'johnny-beo', to: 'leads-beo', label: 'delegate' },
  { from: 'johnny-beo', to: 'social-beo', label: 'publish' },
]

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function loadLayout(): Record<NodeId, PctPos> {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw) as Partial<Record<NodeId, PctPos>>
    return {
      company: parsed.company ?? DEFAULT_LAYOUT.company,
      'johnny-beo': parsed['johnny-beo'] ?? DEFAULT_LAYOUT['johnny-beo'],
      'leads-beo': parsed['leads-beo'] ?? DEFAULT_LAYOUT['leads-beo'],
      'social-beo': parsed['social-beo'] ?? DEFAULT_LAYOUT['social-beo'],
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

function saveLayout(layout: Record<NodeId, PctPos>) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}

function nodeState(card: FleetGraphCard | undefined): NodeState {
  if (!card) return 'off'
  if (card.mode === 'unavailable') return 'warn'
  if (card.mode === 'fleet' && card.agent?.running) return 'on'
  return 'off'
}

function isLiveEdge(from: NodeState, to: NodeState): boolean {
  return from === 'on' && to === 'on'
}

function avatarCandidates(boardId: string, fallback?: string): string[] {
  const stored = loadAgentAvatar(boardId)
  return [
    stored,
    fallback,
    fallback?.replace(/\.jpg$/i, '.png'),
    fallback?.replace(/\.jpg$/i, '.webp'),
    `/ai-agents/${boardId}.jpg`,
    `/ai-agents/${boardId}.png`,
    `/ai-agents/${boardId}.webp`,
  ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i)
}

function useAvatarSrc(boardId: string, fallback?: string) {
  const [idx, setIdx] = useState(0)
  const [src, setSrc] = useState<string | null>(() => avatarCandidates(boardId, fallback)[0] ?? null)

  useEffect(() => {
    const next = avatarCandidates(boardId, fallback)
    setIdx(0)
    setSrc(next[0] ?? null)
  }, [boardId, fallback])

  const onError = () => {
    const next = avatarCandidates(boardId, fallback)
    const i = idx + 1
    if (i < next.length) {
      setIdx(i)
      setSrc(next[i] ?? null)
    } else {
      setSrc(null)
    }
  }

  return { src, onError }
}

function IconChief() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3v3M8 8l-2-2M16 8l2-2" strokeLinecap="round" />
      <circle cx="12" cy="13" r="6" />
      <path d="M10 13h4M12 11v4" strokeLinecap="round" />
    </svg>
  )
}

function IconLeads() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconSocial() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 10v4l8 5V5L4 10z" strokeLinejoin="round" />
      <path d="M14 9c1.5.8 2.5 2.2 2.5 3.5S15.5 15.2 14 16" strokeLinecap="round" />
      <path d="M17 7c2.2 1.2 3.5 3.3 3.5 5.5S19.2 16.8 17 18" strokeLinecap="round" />
    </svg>
  )
}

function IconCompany() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20V8l8-4 8 4v12" strokeLinejoin="round" />
      <path
        d="M9 20v-6h6v6M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01"
        strokeLinecap="round"
      />
    </svg>
  )
}

function edgePath(a: Center, b: Center): { d: string; mid: { x: number; y: number } } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const gap = 4
  const x1 = a.x + ux * (a.r + gap)
  const y1 = a.y + uy * (a.r + gap)
  const x2 = b.x - ux * (b.r + gap)
  const y2 = b.y - uy * (b.r + gap)
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  // gentle curve perpendicular to the chord
  const curve = Math.min(48, len * 0.18)
  const cx = mx - uy * curve
  const cy = my + ux * curve
  return {
    d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
    mid: { x: (x1 + 2 * cx + x2) / 4, y: (y1 + 2 * cy + y2) / 4 },
  }
}

function NetNodeVisual({
  name,
  handle,
  role,
  roleShort,
  blurb,
  status,
  state,
  avatarSrc,
  onAvatarError,
  size = 'md',
  imageFit = 'cover',
  roleIcon,
  accent = 'cyan',
  toolsConnected = 0,
  toolsTotal = 0,
  capabilities = [],
  showEnter,
  orbRef,
}: {
  name: string
  handle?: string
  role: string
  roleShort: string
  blurb?: string
  status: string
  state: NodeState
  avatarSrc?: string | null
  onAvatarError?: () => void
  size?: 'xl' | 'lg' | 'md'
  imageFit?: 'cover' | 'contain'
  roleIcon: ReactNode
  accent?: 'cyan' | 'violet' | 'amber' | 'rose'
  toolsConnected?: number
  toolsTotal?: number
  capabilities?: string[]
  showEnter?: boolean
  orbRef?: (el: HTMLSpanElement | null) => void
}) {
  const panelId = useId()
  const dim =
    size === 'xl' ? 'beo-net-orb--xl' : size === 'lg' ? 'beo-net-orb--lg' : 'beo-net-orb--md'

  return (
    <div className={`beo-net-node beo-net-node--${state} beo-net-node--${accent}`}>
      <span ref={orbRef} className={`beo-net-orb ${dim}`}>
        <svg className="beo-net-ring beo-net-ring--a" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" />
        </svg>
        <svg className="beo-net-ring beo-net-ring--b" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="46" />
        </svg>
        <span className="beo-net-orb-core">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={name}
              className={`beo-net-orb-img ${imageFit === 'contain' ? 'is-contain' : ''}`}
              draggable={false}
              onError={onAvatarError}
            />
          ) : (
            <span className="beo-net-orb-fallback">{name.slice(0, 1)}</span>
          )}
          <span className="beo-net-orb-scan" aria-hidden />
        </span>
        <span className="beo-net-role-badge" title={role}>
          <span className="beo-net-role-badge-icon">{roleIcon}</span>
        </span>
        <span
          className={`beo-net-orb-led ${
            state === 'on' ? 'is-on' : state === 'warn' ? 'is-warn' : 'is-off'
          }`}
        />
      </span>

      <div className="beo-net-meta">
        <div className="beo-net-name">{name}</div>
        <div className="beo-net-role-chip">
          <span className="beo-net-role-chip-icon">{roleIcon}</span>
          <span>{roleShort}</span>
        </div>
        {handle ? (
          <div className="beo-net-handle" dir="ltr">
            {handle}
          </div>
        ) : null}
        <div className={`beo-net-status beo-net-status--${state}`}>{status}</div>
      </div>

      <div className="beo-net-glass" id={panelId} role="tooltip">
        <div className="beo-net-glass-head">
          <span className="beo-net-glass-emoji">{roleIcon}</span>
          <div className="min-w-0">
            <div className="beo-net-glass-name">{name}</div>
            <div className="beo-net-glass-role">{role}</div>
          </div>
        </div>
        {handle ? (
          <p className="beo-net-glass-handle" dir="ltr">
            {handle}
          </p>
        ) : null}
        {blurb ? <p className="beo-net-glass-blurb">{blurb}</p> : null}
        {capabilities.length > 0 ? (
          <ul className="beo-net-glass-caps">
            {capabilities.slice(0, 3).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        <div className="beo-net-glass-stats">
          <span>
            TOOLS{' '}
            <strong>
              {toolsConnected}/{toolsTotal}
            </strong>
          </span>
          <span className={`beo-net-glass-state beo-net-glass-state--${state}`}>{status}</span>
        </div>
        {showEnter ? <span className="beo-net-glass-cta">כניסה ללוח →</span> : null}
        <p className="beo-net-glass-drag-hint">לחיצה ארוכה + גרירה להזזה</p>
      </div>
    </div>
  )
}

export function AgentFleetGraph({
  cards,
  fleetUp,
  onReload,
}: {
  cards: FleetGraphCard[]
  fleetUp: boolean
  onReload?: () => void
}) {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<HTMLDivElement>(null)
  const orbEls = useRef<Partial<Record<NodeId, HTMLSpanElement | null>>>({})
  const [layout, setLayout] = useState<Record<NodeId, PctPos>>(() => loadLayout())
  const [centers, setCenters] = useState<Partial<Record<NodeId, Center>>>({})
  const [dragging, setDragging] = useState<NodeId | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const draggingRef = useRef<NodeId | null>(null)
  const dragMoved = useRef(false)
  const longTimer = useRef<number | null>(null)
  const pendingId = useRef<NodeId | null>(null)
  const layoutRef = useRef(layout)
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  layoutRef.current = layout
  zoomRef.current = zoom
  panRef.current = pan

  const byId = new Map(cards.map((c) => [c.board.id, c]))
  const johnny = byId.get('johnny-beo')
  const shai = byId.get('leads-beo')
  const adi = byId.get('social-beo')

  const jp = getAgentProfile('johnny-beo')
  const sp = getAgentProfile('leads-beo')
  const ap = getAgentProfile('social-beo')

  const johnnyAvatar = useAvatarSrc('johnny-beo', jp?.defaultAvatarSrc)
  const shaiAvatar = useAvatarSrc('leads-beo', sp?.defaultAvatarSrc)
  const adiAvatar = useAvatarSrc('social-beo', ap?.defaultAvatarSrc)

  const companyState: NodeState = fleetUp ? 'on' : 'warn'
  const johnnyState = nodeState(johnny)
  const shaiState = nodeState(shai)
  const adiState = nodeState(adi)
  const states: Record<NodeId, NodeState> = {
    company: companyState,
    'johnny-beo': johnnyState,
    'leads-beo': shaiState,
    'social-beo': adiState,
  }

  const johnnyTools = displayToolsForAgent('johnny-beo', johnny?.agent ?? null)
  const shaiTools = displayToolsForAgent('leads-beo', shai?.agent ?? null)
  const adiTools = displayToolsForAgent('social-beo', adi?.agent ?? null)
  const runningCount = cards.filter((c) => c.mode === 'fleet' && c.agent?.running).length

  const measure = useCallback(() => {
    const stage = stageRef.current
    const camera = cameraRef.current
    if (!stage || !camera) return
    const z = zoomRef.current
    const cr = camera.getBoundingClientRect()
    const next: Partial<Record<NodeId, Center>> = {}
    for (const id of Object.keys(DEFAULT_LAYOUT) as NodeId[]) {
      const el = orbEls.current[id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      next[id] = {
        x: (r.left + r.width / 2 - cr.left) / z,
        y: (r.top + r.height / 2 - cr.top) / z,
        r: r.width / 2 / z,
      }
    }
    setCenters(next)
  }, [])

  useLayoutEffect(() => {
    measure()
    const id = window.requestAnimationFrame(() => measure())
    return () => window.cancelAnimationFrame(id)
  }, [layout, measure, dragging, zoom, pan, johnnyAvatar.src, shaiAvatar.src, adiAvatar.src])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(stage)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const rect = stage.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const z0 = zoomRef.current
      const p0 = panRef.current
      const worldX = (mx - p0.x) / z0
      const worldY = (my - p0.y) / z0

      const factor = e.deltaY < 0 ? 1.09 : 1 / 1.09
      const z1 = clamp(z0 * factor, 0.45, 2.75)
      const nextPan = {
        x: mx - worldX * z1,
        y: my - worldY * z1,
      }
      zoomRef.current = z1
      panRef.current = nextPan
      setZoom(z1)
      setPan(nextPan)
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [])

  const clearLongPress = () => {
    if (longTimer.current != null) {
      window.clearTimeout(longTimer.current)
      longTimer.current = null
    }
    pendingId.current = null
  }

  const onPointerDown = (id: NodeId, e: ReactPointerEvent) => {
    if (e.button !== 0) return
    dragMoved.current = false
    pendingId.current = id
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    longTimer.current = window.setTimeout(() => {
      draggingRef.current = id
      setDragging(id)
      longTimer.current = null
    }, LONG_PRESS_MS)
  }

  const onPointerMove = (id: NodeId, e: ReactPointerEvent) => {
    if (draggingRef.current !== id) return
    const stage = stageRef.current
    if (!stage) return
    dragMoved.current = true
    const sr = stage.getBoundingClientRect()
    const z = zoomRef.current
    const p = panRef.current
    const localX = (e.clientX - sr.left - p.x) / z
    const localY = (e.clientY - sr.top - p.y) / z
    const x = clamp((localX / stage.clientWidth) * 100, 8, 92)
    const y = clamp((localY / stage.clientHeight) * 100 - 4, 2, 86)
    setLayout((prev) => {
      const next = { ...prev, [id]: { x, y } }
      layoutRef.current = next
      return next
    })
  }

  const onPointerUp = (id: NodeId, e: ReactPointerEvent, href?: string) => {
    const wasDragging = draggingRef.current === id
    const moved = dragMoved.current
    clearLongPress()
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    if (wasDragging) {
      draggingRef.current = null
      setDragging(null)
      saveLayout(layoutRef.current)
      return
    }
    if (!moved && href) {
      navigate(href)
    }
  }

  const resetLayout = () => {
    const next = { ...DEFAULT_LAYOUT }
    setLayout(next)
    saveLayout(next)
  }

  const resetCamera = () => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const nudgeZoom = (dir: 1 | -1) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const mx = rect.width / 2
    const my = rect.height / 2
    const z0 = zoomRef.current
    const p0 = panRef.current
    const worldX = (mx - p0.x) / z0
    const worldY = (my - p0.y) / z0
    const z1 = clamp(z0 * (dir > 0 ? 1.12 : 1 / 1.12), 0.45, 2.75)
    const nextPan = { x: mx - worldX * z1, y: my - worldY * z1 }
    zoomRef.current = z1
    panRef.current = nextPan
    setZoom(z1)
    setPan(nextPan)
  }

  useEffect(() => {
    const onFs = () => {
      const el = rootRef.current
      const active = Boolean(
        document.fullscreenElement && el && document.fullscreenElement === el,
      )
      setIsFullscreen(active)
      window.requestAnimationFrame(() => measure())
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [measure])

  const toggleFullscreen = async () => {
    const el = rootRef.current
    if (!el) return
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen()
      } else if (!document.fullscreenElement) {
        await el.requestFullscreen()
      }
    } catch {
      /* ignore — browser may block */
    }
  }

  const stageSize = stageRef.current
  const svgW = Math.max(1, stageSize?.clientWidth || 1)
  const svgH = Math.max(1, stageSize?.clientHeight || 1)

  const drawnEdges = EDGES.map((edge) => {
    const a = centers[edge.from]
    const b = centers[edge.to]
    if (!a || !b) return null
    const { d, mid } = edgePath(a, b)
    const live =
      edge.from === 'company'
        ? fleetUp && states[edge.to] === 'on'
        : isLiveEdge(states[edge.from], states[edge.to])
    const active =
      edge.from === 'company'
        ? fleetUp || states[edge.to] === 'on'
        : states[edge.from] !== 'off' || states[edge.to] !== 'off'
    return { ...edge, d, mid, live, active }
  }).filter(Boolean) as Array<{
    from: NodeId
    to: NodeId
    label: string
    d: string
    mid: { x: number; y: number }
    live: boolean
    active: boolean
  }>

  return (
    <div
      ref={rootRef}
      className={`beo-net beo-net--bleed ${isFullscreen ? 'beo-net--fs' : ''}`}
    >
      <div className="beo-net-stars" aria-hidden />
      <div className="beo-net-mesh" aria-hidden />
      <div className="beo-net-vignette" aria-hidden />
      <div className="beo-net-radar" aria-hidden />

      <header className="beo-net-topbar">
        <div className="min-w-0">
          <p className="beo-net-kicker">Beo OS · Agent Mesh</p>
          <h1 className="beo-net-title">רשת סוכנים</h1>
          <p className="beo-net-sub">
            גלגלת = זום · לחיצה ארוכה = גרירה · לחיצה קצרה = כניסה ללוח
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`beo-net-pill ${fleetUp ? 'is-live' : 'is-dim'}`}>
            <span className="beo-net-pill-dot" />
            {fleetUp ? 'צי מחובר' : 'צי לא זמין'}
          </span>
          <button
            type="button"
            className="beo-net-btn beo-net-btn--ghost"
            onClick={() => nudgeZoom(-1)}
            title="הקטנה"
          >
            −
          </button>
          <button
            type="button"
            className="beo-net-btn beo-net-btn--ghost"
            onClick={() => nudgeZoom(1)}
            title="הגדלה"
          >
            +
          </button>
          <button type="button" className="beo-net-btn beo-net-btn--ghost" onClick={resetCamera}>
            איפוס זום
          </button>
          <button
            type="button"
            className="beo-net-btn beo-net-btn--ghost"
            onClick={() => void toggleFullscreen()}
            aria-pressed={isFullscreen}
            title={isFullscreen ? 'יציאה ממסך מלא (Esc)' : 'צפייה במסך מלא'}
          >
            {isFullscreen ? 'יציאה ממסך מלא' : 'מסך מלא'}
          </button>
          <button type="button" className="beo-net-btn beo-net-btn--ghost" onClick={resetLayout}>
            איפוס מיקומים
          </button>
          <Link to="/ai-agents/overview" className="beo-net-btn beo-net-btn--ghost">
            סקירה
          </Link>
          {onReload ? (
            <button type="button" className="beo-net-btn beo-net-btn--ghost" onClick={onReload}>
              רענון
            </button>
          ) : null}
          <Link to="/ai-agents/leads-beo" className="beo-net-btn beo-net-btn--solid">
            לוח שי
          </Link>
        </div>
      </header>

      <div className="beo-net-hud" aria-hidden>
        <span>
          FLEET <strong>{fleetUp ? 'UP' : 'DOWN'}</strong>
        </span>
        <span>
          LIVE{' '}
          <strong>
            {runningCount}/{cards.length}
          </strong>
        </span>
        <span>
          NODES <strong>4</strong>
        </span>
        <span>
          LAYOUT <strong>{dragging ? 'DRAG' : 'SAVED'}</strong>
        </span>
        <span>
          ZOOM <strong>{Math.round(zoom * 100)}%</strong>
        </span>
      </div>

      <div
        ref={stageRef}
        className={`beo-net-stage ${dragging ? 'is-dragging' : ''}`}
        aria-label="מפת רשת סוכנים"
      >
        <div
          ref={cameraRef}
          className="beo-net-camera"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
        <svg
          className="beo-net-edges"
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="beoNetStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(56,189,248,0.25)" />
              <stop offset="50%" stopColor="rgba(167,139,250,0.95)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0.45)" />
            </linearGradient>
            <filter id="beoNetGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="2.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {drawnEdges.map((edge) => (
            <g key={edge.label}>
              <path
                d={edge.d}
                fill="none"
                stroke="url(#beoNetStroke)"
                strokeWidth={2.6}
                filter="url(#beoNetGlow)"
                className={`beo-net-path ${edge.active ? 'beo-net-path--active' : 'beo-net-path--dim'}`}
              />
              <path
                d={edge.d}
                fill="none"
                stroke={edge.live ? 'rgba(125,211,252,0.95)' : 'rgba(148,163,184,0.35)'}
                strokeWidth={1.7}
                className={`beo-net-path beo-net-path--flow ${edge.live ? '' : 'is-paused'}`}
              />
              {edge.live ? (
                <circle r={3.5} fill="#7dd3fc" className="beo-net-packet">
                  <animateMotion dur="2.2s" repeatCount="indefinite" path={edge.d} />
                </circle>
              ) : null}
            </g>
          ))}
        </svg>

        {drawnEdges.map((edge) => (
          <span
            key={`lbl-${edge.label}`}
            className={`beo-net-edge-label ${edge.live || edge.active ? 'is-live' : 'is-dim'}`}
            style={{ left: edge.mid.x, top: edge.mid.y }}
          >
            {edge.label}
          </span>
        ))}

        {(
          [
            {
              id: 'company' as const,
              href: undefined,
              visual: (
                <NetNodeVisual
                  name="Beo Systems"
                  handle="beo.systems"
                  role="מקור הסמכות של הרשת"
                  roleShort="החברה"
                  blurb="שכבת השליטה של Beo OS — כל הסוכנים מדווחים לכאן."
                  status={fleetUp ? 'רשת פעילה' : 'תצוגה · צי כבוי'}
                  state={companyState}
                  avatarSrc="/logo-beo-os.png"
                  imageFit="contain"
                  size="xl"
                  roleIcon={<IconCompany />}
                  accent="cyan"
                  toolsConnected={fleetUp ? 4 : 0}
                  toolsTotal={4}
                  capabilities={['CRM', 'Mail', 'Calendar', 'Green Invoice']}
                  orbRef={(el) => {
                    orbEls.current.company = el
                  }}
                />
              ),
            },
            {
              id: 'johnny-beo' as const,
              href: johnny?.board.path,
              visual: (
                <NetNodeVisual
                  name={jp?.personName ?? 'ג׳וני'}
                  handle={johnny?.board.handle ?? 'johnny.beo'}
                  role={jp?.title ?? 'מנכ״ל דיגיטלי'}
                  roleShort="מנכ״ל דיגיטלי"
                  blurb={jp?.tagline}
                  status={johnny?.statusLabel ?? '—'}
                  state={johnnyState}
                  avatarSrc={johnnyAvatar.src}
                  onAvatarError={johnnyAvatar.onError}
                  size="lg"
                  roleIcon={<IconChief />}
                  accent="violet"
                  toolsConnected={johnnyTools.filter((t) => t.connected).length}
                  toolsTotal={johnnyTools.length}
                  capabilities={jp?.capabilities}
                  showEnter
                  orbRef={(el) => {
                    orbEls.current['johnny-beo'] = el
                  }}
                />
              ),
            },
            {
              id: 'leads-beo' as const,
              href: shai?.board.path,
              visual: (
                <NetNodeVisual
                  name={sp?.personName ?? 'שי'}
                  handle={shai?.board.handle ?? 'leads.beo'}
                  role={sp?.title ?? 'סוכן גיוס לידים'}
                  roleShort="גיוס לידים"
                  blurb={sp?.tagline}
                  status={shai?.statusLabel ?? '—'}
                  state={shaiState}
                  avatarSrc={shaiAvatar.src}
                  onAvatarError={shaiAvatar.onError}
                  size="md"
                  roleIcon={<IconLeads />}
                  accent="amber"
                  toolsConnected={shaiTools.filter((t) => t.connected).length}
                  toolsTotal={shaiTools.length}
                  capabilities={sp?.capabilities}
                  showEnter
                  orbRef={(el) => {
                    orbEls.current['leads-beo'] = el
                  }}
                />
              ),
            },
            {
              id: 'social-beo' as const,
              href: adi?.board.path,
              visual: (
                <NetNodeVisual
                  name={ap?.personName ?? 'עדי'}
                  handle={adi?.board.handle ?? 'social.beo'}
                  role={ap?.title ?? 'מנהלת סושיאל'}
                  roleShort="סושיאל ורשתות"
                  blurb={ap?.tagline}
                  status={adi?.statusLabel ?? '—'}
                  state={adiState}
                  avatarSrc={adiAvatar.src}
                  onAvatarError={adiAvatar.onError}
                  size="md"
                  roleIcon={<IconSocial />}
                  accent="rose"
                  toolsConnected={adiTools.filter((t) => t.connected).length}
                  toolsTotal={adiTools.length}
                  capabilities={ap?.capabilities}
                  showEnter
                  orbRef={(el) => {
                    orbEls.current['social-beo'] = el
                  }}
                />
              ),
            },
          ] as const
        ).map((node) => {
          const pos = layout[node.id]
          const isDrag = dragging === node.id
          const glassUp = pos.y >= 48
          const glassSide = pos.x <= 22 ? 'end' : pos.x >= 78 ? 'start' : 'center'
          return (
            <div
              key={node.id}
              className={`beo-net-slot beo-net-slot--free ${isDrag ? 'is-drag' : ''} ${
                glassUp ? 'beo-net-slot--glass-up' : ''
              } beo-net-slot--glass-${glassSide}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              onPointerDown={(e) => onPointerDown(node.id, e)}
              onPointerMove={(e) => onPointerMove(node.id, e)}
              onPointerUp={(e) => onPointerUp(node.id, e, node.href)}
              onPointerCancel={() => {
                clearLongPress()
                draggingRef.current = null
                setDragging(null)
              }}
              role={node.href ? 'link' : 'group'}
              tabIndex={0}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && node.href) {
                  e.preventDefault()
                  navigate(node.href)
                }
              }}
            >
              <div className={`beo-net-anchor ${node.href ? 'beo-net-anchor--link' : ''}`}>
                {node.visual}
              </div>
            </div>
          )
        })}
        </div>
      </div>

      <footer className="beo-net-legend">
        <span>
          <i className="beo-net-legend-dot is-on" /> רץ
        </span>
        <span>
          <i className="beo-net-legend-dot is-warn" /> לא זמין
        </span>
        <span>
          <i className="beo-net-legend-dot is-off" /> כבוי
        </span>
        <span className="beo-net-legend-hint">
          גלגלת = זום · לחיצה ארוכה = הזזה · שחרור = שמירה
        </span>
      </footer>
    </div>
  )
}

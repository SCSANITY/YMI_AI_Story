'use client'

import { useEffect, useRef } from 'react'

const W = 840
const H = 315
const GROUND_Y = H - 50
const GRAVITY = 0.58
const JUMP_V = -12.5
const CHAR_W = 22
const CHAR_H = 28
const CHAR_X = 60

type State = 'idle' | 'playing' | 'dead'

interface Rect { x: number; y: number; w: number; h: number }
type Coin = Rect & { taken: boolean }
type Cloud = { x: number; y: number; w: number; spd: number }

function hits(a: Rect, b: Rect) {
  const margin = 3
  return (
    a.x + margin < b.x + b.w &&
    a.x + a.w - margin > b.x &&
    a.y + margin < b.y + b.h &&
    a.y + a.h - margin > b.y
  )
}

export function MiniGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let state: State = 'idle'
    let charY = GROUND_Y - CHAR_H
    let charVY = 0
    let grounded = true
    let score = 0
    let best = 0
    let frame = 0
    let tick = 0
    let speed = 3.5
    let obstacles: Rect[] = []
    let coins: Coin[] = []
    let nextObstacle = 90
    let nextCoin = 130
    let animationFrame = 0
    let groundOffset = 0

    // Clouds — initialised spread across the canvas
    const clouds: Cloud[] = Array.from({ length: 6 }, (_, i) => ({
      x: (W / 6) * i + Math.random() * 80,
      y: 18 + Math.random() * 60,
      w: 60 + Math.random() * 50,
      spd: 0.3 + Math.random() * 0.25,
    }))

    // Distant hills — static decorative bumps
    const hills = [
      { x: 80,  y: GROUND_Y - 42, r: 52 },
      { x: 230, y: GROUND_Y - 30, r: 38 },
      { x: 420, y: GROUND_Y - 55, r: 68 },
      { x: 620, y: GROUND_Y - 35, r: 44 },
      { x: 750, y: GROUND_Y - 28, r: 36 },
    ]

    const resetGame = () => {
      charY = GROUND_Y - CHAR_H
      charVY = 0; grounded = true; score = 0; frame = 0; speed = 3.5
      obstacles = []; coins = []; nextObstacle = 90; nextCoin = 130
    }

    const tryJump = () => {
      if (state === 'idle' || state === 'dead') { resetGame(); state = 'playing'; return }
      if (state === 'playing' && grounded) { charVY = JUMP_V; grounded = false }
    }

    // ── Draw: book character ──────────────────────────────────────────────
    const drawBook = (x: number, y: number, dead: boolean, runFrame: number) => {
      const bobY = (state === 'playing' && grounded) ? Math.sin(runFrame * 0.3) * 1.5 : 0
      const by = Math.round(y + bobY)

      // Shadow
      if (!dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.10)'
        ctx.fillRect(x + 2, GROUND_Y - 2, CHAR_W - 2, 3)
      }

      // Body (amber book cover)
      ctx.fillStyle = dead ? '#9ca3af' : '#f59e0b'
      ctx.fillRect(x, by, CHAR_W, CHAR_H)

      // Spine (left dark strip)
      ctx.fillStyle = dead ? '#6b7280' : '#b45309'
      ctx.fillRect(x, by, 4, CHAR_H)

      // Inner page area
      ctx.fillStyle = dead ? '#d1d5db' : '#fffbeb'
      ctx.fillRect(x + 5, by + 3, CHAR_W - 7, CHAR_H - 5)

      // Page lines
      ctx.fillStyle = dead ? '#e5e7eb' : '#fde68a'
      for (let ln = 0; ln < 3; ln++) {
        ctx.fillRect(x + 7, by + 6 + ln * 6, CHAR_W - 10, 2)
      }

      // Eyes / X-eyes
      if (!dead) {
        ctx.fillStyle = '#1e1b4b'
        ctx.fillRect(x + 8, by + 7, 2, 2)
        ctx.fillRect(x + 14, by + 7, 2, 2)
        // smile
        ctx.fillStyle = '#92400e'
        ctx.fillRect(x + 8, by + 13, 2, 1)
        ctx.fillRect(x + 10, by + 14, 4, 1)
        ctx.fillRect(x + 14, by + 13, 2, 1)
      } else {
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(x + 7, by + 6, 4, 2); ctx.fillRect(x + 8, by + 6, 2, 4)
        ctx.fillRect(x + 13, by + 6, 4, 2); ctx.fillRect(x + 14, by + 6, 2, 4)
      }

      // Running legs (little rectangles)
      if (state === 'playing' && grounded) {
        const legPhase = Math.floor(runFrame / 6) % 2
        ctx.fillStyle = dead ? '#6b7280' : '#92400e'
        ctx.fillRect(x + 4, by + CHAR_H, 5, legPhase === 0 ? 5 : 3)
        ctx.fillRect(x + 12, by + CHAR_H, 5, legPhase === 0 ? 3 : 5)
      }
    }

    // ── Draw: pipe obstacle ───────────────────────────────────────────────
    const drawObstacle = (o: Rect) => {
      // Pipe body
      ctx.fillStyle = '#15803d'
      ctx.fillRect(o.x + 2, o.y, o.w - 4, o.h)
      // Pipe cap (wider, darker)
      ctx.fillStyle = '#166534'
      ctx.fillRect(o.x, o.y, o.w, 10)
      // Highlight
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(o.x + 4, o.y + 2, 3, o.h - 4)
      ctx.fillRect(o.x + 4, o.y + 2, o.w - 8, 3)
    }

    // ── Draw: coin (gold star) ────────────────────────────────────────────
    const drawCoin = (coin: Coin) => {
      if (coin.taken) return
      const cx = Math.floor(coin.x + coin.w / 2)
      const cy = Math.floor(coin.y + coin.h / 2)
      // Star shape
      ctx.fillStyle = '#facc15'
      ctx.fillRect(cx - 2, cy - 5, 4, 10)
      ctx.fillRect(cx - 5, cy - 2, 10, 4)
      ctx.fillRect(cx - 3, cy - 3, 2, 2); ctx.fillRect(cx + 1, cy - 3, 2, 2)
      ctx.fillRect(cx - 3, cy + 1, 2, 2); ctx.fillRect(cx + 1, cy + 1, 2, 2)
      // Shine
      ctx.fillStyle = '#fef9c3'
      ctx.fillRect(cx - 1, cy - 1, 2, 2)
    }

    // ── Draw: HUD key hint ────────────────────────────────────────────────
    const drawKey = (label: string, cx: number, cy: number, w: number, h: number) => {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.fillRect(cx - w / 2, cy - h / 2 + 3, w, h)
      ctx.fillStyle = 'rgba(0,0,0,0.08)'
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillRect(cx - w / 2, cy - h / 2, w, 1)
      ctx.fillStyle = '#334155'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx, cy + 4)
    }

    // ── Update ────────────────────────────────────────────────────────────
    const update = () => {
      tick++
      // Animate clouds
      for (const c of clouds) {
        c.x -= c.spd
        if (c.x + c.w < 0) c.x = W + 10
      }
      if (state !== 'playing') return

      frame++
      score++
      speed = 3.5 + Math.floor(frame / 600) * 0.3
      groundOffset = (groundOffset + speed) % 32

      if (!grounded) { charVY += GRAVITY; charY += charVY }
      if (charY >= GROUND_Y - CHAR_H) { charY = GROUND_Y - CHAR_H; charVY = 0; grounded = true }

      nextObstacle--
      if (nextObstacle <= 0) {
        const oh = 26 + Math.floor(Math.random() * 26)
        obstacles.push({ x: W + 8, y: GROUND_Y - oh, w: 18, h: oh })
        nextObstacle = Math.max(42, 62 + Math.floor(Math.random() * 70) - Math.floor(frame / 600) * 4)
      }

      nextCoin--
      if (nextCoin <= 0) {
        if (Math.random() < 0.65) {
          const yo = 34 + Math.floor(Math.random() * 52)
          coins.push({ x: W + 8, y: GROUND_Y - yo - 12, w: 12, h: 12, taken: false })
        }
        nextCoin = 80 + Math.floor(Math.random() * 110)
      }

      obstacles = obstacles.filter(o => o.x > -20)
      for (const o of obstacles) {
        o.x -= speed
        if (hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, o)) {
          state = 'dead'
          if (score > best) best = score
          return
        }
      }

      coins = coins.filter(c => c.x > -20)
      for (const c of coins) {
        c.x -= speed
        if (!c.taken && hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, c)) {
          c.taken = true; score += 50
        }
      }
    }

    // ── Render ────────────────────────────────────────────────────────────
    const render = () => {
      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
      sky.addColorStop(0, '#56b4d3')
      sky.addColorStop(1, '#a8e6f0')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, GROUND_Y)

      // Sun
      const sunX = W - 55, sunY = 38
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(sunX - 18, sunY - 18, 36, 36)
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(sunX - 14, sunY - 14, 28, 28)
      // Sun rays (pixel)
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(sunX - 24, sunY - 2, 6, 4)
      ctx.fillRect(sunX + 18, sunY - 2, 6, 4)
      ctx.fillRect(sunX - 2, sunY - 24, 4, 6)
      ctx.fillRect(sunX - 2, sunY + 18, 4, 6)

      // Far hills (muted green)
      ctx.fillStyle = '#86efac'
      for (const h of hills) {
        ctx.fillRect(h.x - h.r, h.y, h.r * 2, GROUND_Y - h.y + 2)
        ctx.fillRect(h.x - Math.floor(h.r * 0.85), h.y - 10, Math.floor(h.r * 1.7), 14)
        ctx.fillRect(h.x - Math.floor(h.r * 0.55), h.y - 18, Math.floor(h.r * 1.1), 12)
      }

      // Clouds (fluffy pixel blobs)
      for (const c of clouds) {
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.fillRect(c.x, c.y + 8, c.w, 14)
        ctx.fillRect(c.x + 8, c.y, c.w - 16, 22)
        ctx.fillRect(c.x + 18, c.y - 6, Math.floor(c.w * 0.5), 16)
        ctx.fillRect(c.x + 4, c.y + 2, 14, 10)
        ctx.fillStyle = 'rgba(240,248,255,0.6)'
        ctx.fillRect(c.x + 10, c.y + 2, 6, 4)
      }

      // Ground — green top + brown body + grass detail
      ctx.fillStyle = '#16a34a'
      ctx.fillRect(0, GROUND_Y, W, 6)
      ctx.fillStyle = '#15803d'
      ctx.fillRect(0, GROUND_Y + 6, W, H - GROUND_Y - 6)
      // Grass tufts
      ctx.fillStyle = '#22c55e'
      for (let gx = (-groundOffset | 0) % 32; gx < W; gx += 32) {
        ctx.fillRect(gx, GROUND_Y - 2, 4, 4)
        ctx.fillRect(gx + 8, GROUND_Y - 3, 3, 3)
        ctx.fillRect(gx + 16, GROUND_Y - 2, 4, 3)
      }
      // Brown ground pattern
      ctx.fillStyle = '#92400e'
      for (let gx = (-groundOffset | 0) % 32; gx < W; gx += 32) {
        ctx.fillRect(gx + 4, GROUND_Y + 10, 12, 6)
        ctx.fillRect(gx + 20, GROUND_Y + 10, 10, 6)
      }

      // Game objects
      for (const c of coins) drawCoin(c)
      for (const o of obstacles) drawObstacle(o)
      drawBook(CHAR_X, charY, state === 'dead', frame)

      // HUD score
      ctx.textAlign = 'right'
      ctx.fillStyle = '#1e3a5f'
      ctx.font = 'bold 12px monospace'
      ctx.fillText(`SCORE ${score}`, W - 10, 18)
      if (best > 0) {
        ctx.fillStyle = 'rgba(30,58,95,0.5)'
        ctx.fillText(`BEST ${best}`, W - 10, 34)
      }
      ctx.textAlign = 'center'

      // ── Idle screen ──────────────────────────────────────────────────────
      if (state === 'idle') {
        // Very light tint — grassland background stays fully visible
        ctx.fillStyle = 'rgba(255,252,240,0.22)'
        ctx.fillRect(0, 0, W, H)

        const cx = W / 2
        const cardW = 370, cardH = 126
        const cardX = Math.round(cx - cardW / 2)
        const cardY = Math.round((GROUND_Y - cardH) / 2) - 8

        // Card drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.10)'
        ctx.fillRect(cardX + 4, cardY + 6, cardW, cardH)

        // Card body
        ctx.fillStyle = 'rgba(255,255,255,0.90)'
        ctx.fillRect(cardX, cardY, cardW, cardH)

        // Amber top accent stripe
        ctx.fillStyle = 'rgba(251,191,36,0.80)'
        ctx.fillRect(cardX, cardY, cardW, 4)

        // Card border
        ctx.strokeStyle = 'rgba(245,158,11,0.28)'
        ctx.lineWidth = 1
        ctx.strokeRect(cardX + 0.5, cardY + 4.5, cardW - 1, cardH - 4)

        // Title
        ctx.fillStyle = '#7c2d12'
        ctx.font = 'bold 19px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('MAGIC BOOK RUNNER', cx, cardY + 30)

        // Description
        ctx.fillStyle = '#57534e'
        ctx.font = '11px monospace'
        ctx.fillText('Dodge pipes  •  Collect stars for bonus points', cx, cardY + 50)

        // Divider
        ctx.fillStyle = 'rgba(180,140,60,0.30)'
        ctx.fillRect(cardX + 50, cardY + 60, cardW - 100, 1)

        // Blink "PRESS TO START"
        const blink = 0.55 + 0.45 * Math.sin(tick * 0.07)
        ctx.fillStyle = `rgba(124,45,18,${blink})`
        ctx.font = 'bold 15px monospace'
        ctx.fillText('▶  PRESS TO START', cx, cardY + 80)

        // Key hints
        drawKey('SPACE', cx - 48, cardY + 108, 72, 22)
        drawKey('UP ↑', cx + 34, cardY + 108, 44, 22)

        // Below card hint
        ctx.fillStyle = 'rgba(100,90,80,0.82)'
        ctx.font = '10px monospace'
        ctx.fillText('or tap / click anywhere', cx, cardY + cardH + 20)
      }

      // ── Dead screen ──────────────────────────────────────────────────────
      if (state === 'dead') {
        ctx.fillStyle = 'rgba(255,245,235,0.90)'
        ctx.fillRect(0, 0, W, H)

        ctx.fillStyle = '#b91c1c'
        ctx.font = 'bold 17px monospace'
        ctx.fillText('OOPS! GAME OVER', W / 2, H / 2 - 28)

        ctx.fillStyle = '#78350f'
        ctx.font = '13px monospace'
        ctx.fillText(`Score: ${score}   Best: ${best}`, W / 2, H / 2 - 6)

        ctx.fillStyle = 'rgba(180,140,60,0.25)'
        ctx.fillRect(W / 2 - 80, H / 2 + 4, 160, 1)

        const blink = 0.55 + 0.45 * Math.sin(tick * 0.07)
        ctx.fillStyle = `rgba(146,64,14,${blink})`
        ctx.font = 'bold 12px monospace'
        ctx.fillText('PLAY AGAIN', W / 2, H / 2 + 22)

        drawKey('SPACE', W / 2 - 52, H / 2 + 46, 72, 22)
        drawKey('UP', W / 2 + 16, H / 2 + 46, 28, 22)

        ctx.fillStyle = 'rgba(120,113,108,0.7)'
        ctx.font = '10px monospace'
        ctx.fillText('or tap / click anywhere', W / 2, H / 2 + 74)
      }
    }

    const loop = () => { update(); render(); animationFrame = requestAnimationFrame(loop) }

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); tryJump() }
    }
    const handlePointer = () => tryJump()
    const handleTouch = (e: TouchEvent) => { e.preventDefault(); tryJump() }

    window.addEventListener('keydown', handleKey)
    canvas.addEventListener('click', handlePointer)
    canvas.addEventListener('touchstart', handleTouch)
    animationFrame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('keydown', handleKey)
      canvas.removeEventListener('click', handlePointer)
      canvas.removeEventListener('touchstart', handleTouch)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="mb-5 block h-auto w-full max-w-3xl cursor-pointer select-none rounded-2xl border border-white/40 shadow-lg"
      style={{ imageRendering: 'pixelated', display: 'block', touchAction: 'none' }}
    />
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

const DESKTOP_GAME_SIZE = { width: 960, height: 360 }
const MOBILE_GAME_SIZE = { width: 560, height: 360 }
const TARGET_FRAME_MS = 1000 / 30

type State = 'idle' | 'playing' | 'dead'

interface Rect { x: number; y: number; w: number; h: number }
type Coin = Rect & { taken: boolean }

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
  const [gameSize, setGameSize] = useState({ ...DESKTOP_GAME_SIZE, isMobile: false })

  useEffect(() => {
    const updateSize = () => {
      const isMobile = window.matchMedia('(max-width: 640px)').matches
      const next = isMobile ? { ...MOBILE_GAME_SIZE, isMobile } : { ...DESKTOP_GAME_SIZE, isMobile }
      setGameSize((prev) => (
        prev.width === next.width && prev.height === next.height && prev.isMobile === next.isMobile ? prev : next
      ))
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const W = gameSize.width
    const H = gameSize.height
    const GROUND_Y = H - (gameSize.isMobile ? 76 : 62)
    const GRAVITY = gameSize.isMobile ? 0.86 : 0.78
    const JUMP_V = gameSize.isMobile ? -15.8 : -14.4
    const CHAR_W = gameSize.isMobile ? 40 : 34
    const CHAR_H = gameSize.isMobile ? 50 : 42
    const CHAR_X = gameSize.isMobile ? 58 : 78

    let state: State = 'idle'
    let charY = GROUND_Y - CHAR_H
    let charVY = 0
    let grounded = true
    let score = 0
    let best = 0
    let frame = 0
    let speed = gameSize.isMobile ? 3.1 : 3.5
    let obstacles: Rect[] = []
    let coins: Coin[] = []
    let nextObstacle = 90
    let nextCoin = 130
    let animationFrame = 0
    let lastFrameTime = 0
    let background: HTMLCanvasElement | null = null

    const stopLoop = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }
      lastFrameTime = 0
    }

    const buildBackground = () => {
      const bg = document.createElement('canvas')
      bg.width = W
      bg.height = H
      const bgCtx = bg.getContext('2d', { alpha: false })
      if (!bgCtx) return null

      const sky = bgCtx.createLinearGradient(0, 0, 0, GROUND_Y)
      sky.addColorStop(0, '#56b4d3')
      sky.addColorStop(1, '#a8e6f0')
      bgCtx.fillStyle = sky
      bgCtx.fillRect(0, 0, W, GROUND_Y)

      const sunX = W - 55
      const sunY = 38
      bgCtx.fillStyle = '#fbbf24'
      bgCtx.fillRect(sunX - 18, sunY - 18, 36, 36)
      bgCtx.fillStyle = '#fde68a'
      bgCtx.fillRect(sunX - 14, sunY - 14, 28, 28)

      const hills = gameSize.isMobile
        ? [
            { x: 62, y: GROUND_Y - 48, r: 58 },
            { x: 210, y: GROUND_Y - 38, r: 46 },
            { x: 370, y: GROUND_Y - 60, r: 70 },
            { x: 515, y: GROUND_Y - 34, r: 46 },
          ]
        : [
            { x: 80, y: GROUND_Y - 40, r: 52 },
            { x: 230, y: GROUND_Y - 28, r: 38 },
            { x: 420, y: GROUND_Y - 54, r: 66 },
            { x: 640, y: GROUND_Y - 34, r: 44 },
            { x: 810, y: GROUND_Y - 28, r: 36 },
          ]

      bgCtx.fillStyle = '#86efac'
      for (const h of hills) {
        bgCtx.fillRect(h.x - h.r, h.y, h.r * 2, GROUND_Y - h.y + 2)
        bgCtx.fillRect(h.x - Math.floor(h.r * 0.85), h.y - 10, Math.floor(h.r * 1.7), 14)
        bgCtx.fillRect(h.x - Math.floor(h.r * 0.55), h.y - 18, Math.floor(h.r * 1.1), 12)
      }

      const cloudCount = gameSize.isMobile ? 4 : 5
      for (let i = 0; i < cloudCount; i += 1) {
        const cw = (gameSize.isMobile ? 66 : 58) + i * 7
        const cx = Math.round((W / cloudCount) * i + 20)
        const cy = 24 + (i % 2) * (gameSize.isMobile ? 38 : 28)
        bgCtx.fillStyle = 'rgba(255,255,255,0.92)'
        bgCtx.fillRect(cx, cy + 8, cw, 14)
        bgCtx.fillRect(cx + 8, cy, cw - 16, 22)
        bgCtx.fillRect(cx + 18, cy - 6, Math.floor(cw * 0.5), 16)
      }

      bgCtx.fillStyle = '#16a34a'
      bgCtx.fillRect(0, GROUND_Y, W, 6)
      bgCtx.fillStyle = '#15803d'
      bgCtx.fillRect(0, GROUND_Y + 6, W, H - GROUND_Y - 6)
      bgCtx.fillStyle = '#22c55e'
      for (let gx = 0; gx < W; gx += 32) {
        bgCtx.fillRect(gx, GROUND_Y - 2, 4, 4)
        bgCtx.fillRect(gx + 12, GROUND_Y - 3, 3, 3)
        bgCtx.fillRect(gx + 22, GROUND_Y - 2, 4, 3)
      }
      bgCtx.fillStyle = '#92400e'
      for (let gx = 0; gx < W; gx += 36) {
        bgCtx.fillRect(gx + 4, GROUND_Y + 11, 12, 6)
        bgCtx.fillRect(gx + 22, GROUND_Y + 11, 10, 6)
      }

      return bg
    }

    const resetGame = () => {
      charY = GROUND_Y - CHAR_H
      charVY = 0
      grounded = true
      score = 0
      frame = 0
      speed = gameSize.isMobile ? 3.1 : 3.5
      obstacles = []
      coins = []
      nextObstacle = 90
      nextCoin = 130
    }

    const drawBook = (x: number, y: number, dead: boolean, runFrame: number) => {
      const bobY = state === 'playing' && grounded ? Math.sin(runFrame * 0.3) * 1.2 : 0
      const by = Math.round(y + bobY)
      const scale = CHAR_W / 22

      if (!dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.10)'
        ctx.fillRect(x + 3, GROUND_Y - 3, CHAR_W - 3, 5)
      }

      ctx.fillStyle = dead ? '#9ca3af' : '#f59e0b'
      ctx.fillRect(x, by, CHAR_W, CHAR_H)
      ctx.fillStyle = dead ? '#6b7280' : '#b45309'
      ctx.fillRect(x, by, Math.round(5 * scale), CHAR_H)
      ctx.fillStyle = dead ? '#d1d5db' : '#fffbeb'
      ctx.fillRect(x + Math.round(7 * scale), by + Math.round(4 * scale), CHAR_W - Math.round(10 * scale), CHAR_H - Math.round(7 * scale))

      ctx.fillStyle = dead ? '#e5e7eb' : '#fde68a'
      for (let ln = 0; ln < 3; ln += 1) {
        ctx.fillRect(
          x + Math.round(10 * scale),
          by + Math.round(9 * scale) + ln * Math.round(8 * scale),
          CHAR_W - Math.round(15 * scale),
          Math.max(2, Math.round(2 * scale)),
        )
      }

      if (!dead) {
        ctx.fillStyle = '#1e1b4b'
        ctx.fillRect(x + Math.round(11 * scale), by + Math.round(10 * scale), 3, 3)
        ctx.fillRect(x + Math.round(17 * scale), by + Math.round(10 * scale), 3, 3)
        ctx.fillStyle = '#92400e'
        ctx.fillRect(x + Math.round(10 * scale), by + Math.round(19 * scale), 3, 2)
        ctx.fillRect(x + Math.round(13 * scale), by + Math.round(21 * scale), 7, 2)
        ctx.fillRect(x + Math.round(20 * scale), by + Math.round(19 * scale), 3, 2)
      } else {
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(x + Math.round(9 * scale), by + Math.round(8 * scale), 6, 3)
        ctx.fillRect(x + Math.round(11 * scale), by + Math.round(8 * scale), 3, 6)
        ctx.fillRect(x + Math.round(18 * scale), by + Math.round(8 * scale), 6, 3)
        ctx.fillRect(x + Math.round(20 * scale), by + Math.round(8 * scale), 3, 6)
      }

      if (state === 'playing' && grounded) {
        const legPhase = Math.floor(runFrame / 6) % 2
        ctx.fillStyle = '#92400e'
        ctx.fillRect(x + Math.round(5 * scale), by + CHAR_H, 8, legPhase === 0 ? 8 : 5)
        ctx.fillRect(x + Math.round(17 * scale), by + CHAR_H, 8, legPhase === 0 ? 5 : 8)
      }
    }

    const drawObstacle = (o: Rect) => {
      ctx.fillStyle = '#15803d'
      ctx.fillRect(o.x + 3, o.y, o.w - 6, o.h)
      ctx.fillStyle = '#166534'
      ctx.fillRect(o.x, o.y, o.w, 15)
      ctx.fillStyle = '#22c55e'
      ctx.fillRect(o.x + 6, o.y + 3, 5, o.h - 7)
    }

    const drawCoin = (coin: Coin) => {
      if (coin.taken) return
      const cx = Math.floor(coin.x + coin.w / 2)
      const cy = Math.floor(coin.y + coin.h / 2)
      ctx.fillStyle = '#facc15'
      ctx.fillRect(cx - 3, cy - 8, 6, 16)
      ctx.fillRect(cx - 8, cy - 3, 16, 6)
      ctx.fillStyle = '#fef9c3'
      ctx.fillRect(cx - 2, cy - 2, 4, 4)
    }

    const update = () => {
      frame += 1
      score += 1
      speed = (gameSize.isMobile ? 3.1 : 3.5) + Math.floor(frame / 600) * 0.25

      if (!grounded) {
        charVY += GRAVITY
        charY += charVY
      }
      if (charY >= GROUND_Y - CHAR_H) {
        charY = GROUND_Y - CHAR_H
        charVY = 0
        grounded = true
      }

      nextObstacle -= 1
      if (nextObstacle <= 0) {
        const oh = (gameSize.isMobile ? 44 : 38) + Math.floor(Math.random() * (gameSize.isMobile ? 42 : 34))
        obstacles.push({ x: W + 10, y: GROUND_Y - oh, w: gameSize.isMobile ? 32 : 28, h: oh })
        nextObstacle = Math.max(46, 66 + Math.floor(Math.random() * 72) - Math.floor(frame / 600) * 4)
      }

      nextCoin -= 1
      if (nextCoin <= 0) {
        if (Math.random() < 0.58) {
          const yo = (gameSize.isMobile ? 42 : 34) + Math.floor(Math.random() * (gameSize.isMobile ? 62 : 48))
          const size = gameSize.isMobile ? 20 : 18
          coins.push({ x: W + 10, y: GROUND_Y - yo - size, w: size, h: size, taken: false })
        }
        nextCoin = 88 + Math.floor(Math.random() * 110)
      }

      obstacles = obstacles.filter((o) => o.x > -24)
      for (const o of obstacles) {
        o.x -= speed
        if (hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, o)) {
          state = 'dead'
          best = Math.max(best, score)
          return
        }
      }

      coins = coins.filter((c) => c.x > -24)
      for (const c of coins) {
        c.x -= speed
        if (!c.taken && hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, c)) {
          c.taken = true
          score += 50
        }
      }
    }

    const drawIdleOverlay = () => {
      ctx.fillStyle = 'rgba(255,252,240,0.24)'
      ctx.fillRect(0, 0, W, H)

      const cx = W / 2
      const cardW = Math.min(gameSize.isMobile ? 430 : 520, W - 48)
      const cardH = gameSize.isMobile ? 150 : 146
      const cardX = Math.round(cx - cardW / 2)
      const cardY = Math.round((GROUND_Y - cardH) / 2) + 4

      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.fillRect(cardX + 4, cardY + 6, cardW, cardH)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fillRect(cardX, cardY, cardW, cardH)
      ctx.fillStyle = 'rgba(251,191,36,0.82)'
      ctx.fillRect(cardX, cardY, cardW, 4)
      ctx.strokeStyle = 'rgba(245,158,11,0.26)'
      ctx.strokeRect(cardX + 0.5, cardY + 4.5, cardW - 1, cardH - 4)

      ctx.fillStyle = '#7c2d12'
      ctx.font = `${gameSize.isMobile ? 'bold 21px' : 'bold 23px'} "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.fillText('MAGIC BOOK RUNNER', cx, cardY + 40)

      ctx.font = `${gameSize.isMobile ? 'bold 42px' : 'bold 46px'} "Courier New", monospace`
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      ctx.fillText('Tap to start', cx + 4, cardY + 104)
      ctx.fillStyle = '#7c2d12'
      ctx.fillText('Tap to start', cx, cardY + 100)
      ctx.fillStyle = 'rgba(251,191,36,0.90)'
      ctx.fillRect(cardX + Math.round(cardW * 0.24), cardY + 116, Math.round(cardW * 0.52), 5)
    }

    const drawDeadOverlay = () => {
      ctx.fillStyle = 'rgba(255,245,235,0.92)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.fillStyle = '#b91c1c'
      ctx.font = 'bold 20px "Courier New", monospace'
      ctx.fillText('OOPS! GAME OVER', W / 2, H / 2 - 24)
      ctx.fillStyle = '#78350f'
      ctx.font = 'bold 16px "Courier New", monospace'
      ctx.fillText(`Score: ${score}   Best: ${best}`, W / 2, H / 2 + 2)
      ctx.fillStyle = '#92400e'
      ctx.font = 'bold 20px "Courier New", monospace'
      ctx.fillText('Tap to play again', W / 2, H / 2 + 42)
    }

    const render = () => {
      if (background) {
        ctx.drawImage(background, 0, 0)
      } else {
        ctx.fillStyle = '#a8e6f0'
        ctx.fillRect(0, 0, W, H)
      }

      for (const c of coins) drawCoin(c)
      for (const o of obstacles) drawObstacle(o)
      drawBook(CHAR_X, charY, state === 'dead', frame)

      ctx.textAlign = 'right'
      ctx.fillStyle = '#1e3a5f'
      ctx.font = 'bold 16px "Courier New", monospace'
      ctx.fillText(`SCORE ${score}`, W - 10, 20)
      if (best > 0) {
        ctx.fillStyle = 'rgba(30,58,95,0.52)'
        ctx.fillText(`BEST ${best}`, W - 10, 40)
      }

      if (state === 'idle') drawIdleOverlay()
      if (state === 'dead') drawDeadOverlay()
    }

    const loop = (time: number) => {
      if (state !== 'playing') {
        stopLoop()
        render()
        return
      }

      if (!lastFrameTime || time - lastFrameTime >= TARGET_FRAME_MS) {
        lastFrameTime = time
        update()
        render()
      }

      if (state === 'playing') {
        animationFrame = requestAnimationFrame(loop)
      } else {
        stopLoop()
        render()
      }
    }

    const startLoop = () => {
      if (!animationFrame) {
        lastFrameTime = 0
        animationFrame = requestAnimationFrame(loop)
      }
    }

    const tryJump = () => {
      if (state === 'idle' || state === 'dead') {
        resetGame()
        state = 'playing'
        render()
        startLoop()
        return
      }
      if (state === 'playing' && grounded) {
        charVY = JUMP_V
        grounded = false
      }
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault()
        tryJump()
      }
    }
    const handlePointer = () => tryJump()
    const handleTouch = (e: TouchEvent) => {
      e.preventDefault()
      tryJump()
    }
    const handleVisibility = () => {
      if (document.hidden && state === 'playing') {
        state = 'idle'
        stopLoop()
        resetGame()
        render()
      }
    }

    background = buildBackground()
    resetGame()
    render()

    window.addEventListener('keydown', handleKey)
    document.addEventListener('visibilitychange', handleVisibility)
    canvas.addEventListener('click', handlePointer)
    canvas.addEventListener('touchstart', handleTouch, { passive: false })

    return () => {
      stopLoop()
      window.removeEventListener('keydown', handleKey)
      document.removeEventListener('visibilitychange', handleVisibility)
      canvas.removeEventListener('click', handlePointer)
      canvas.removeEventListener('touchstart', handleTouch)
    }
  }, [gameSize])

  return (
    <div className="mb-5 w-full max-w-5xl rounded-[24px] border border-amber-100/80 bg-white/70 p-2 shadow-[0_12px_30px_rgba(148,93,34,0.10)] md:p-2.5">
      <canvas
        ref={canvasRef}
        width={gameSize.width}
        height={gameSize.height}
        className="block h-auto w-full cursor-pointer select-none rounded-2xl border border-white/70 shadow-sm"
        style={{ imageRendering: 'pixelated', display: 'block', touchAction: 'none' }}
        aria-label="Magic Book Runner waiting game. Tap, click, Space, or Up Arrow to jump."
      />
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'

const W = 840
const H = 315
const GROUND_Y = H - 36
const GRAVITY = 0.58
const JUMP_V = -12.5
const CHAR_W = 20
const CHAR_H = 26
const CHAR_X = 60

type State = 'idle' | 'playing' | 'dead'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

type Coin = Rect & { taken: boolean }
type Star = { x: number; y: number; size: number; spd: number }

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

    const context = canvas.getContext('2d')
    if (context === null) return

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
    const backgroundStars: Star[] = []
    let nextObstacle = 90
    let nextCoin = 130
    let animationFrame = 0

    for (let index = 0; index < 55; index += 1) {
      backgroundStars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y - 10),
        size: Math.random() < 0.25 ? 2 : 1,
        spd: Math.random() < 0.3 ? 0.5 : 0.2,
      })
    }

    const resetGame = () => {
      charY = GROUND_Y - CHAR_H
      charVY = 0
      grounded = true
      score = 0
      frame = 0
      speed = 3.5
      obstacles = []
      coins = []
      nextObstacle = 90
      nextCoin = 130
    }

    const tryJump = () => {
      if (state === 'idle' || state === 'dead') {
        resetGame()
        state = 'playing'
        return
      }

      if (state === 'playing' && grounded) {
        charVY = JUMP_V
        grounded = false
      }
    }

    const drawBook = (x: number, y: number, dead: boolean) => {
      context.fillStyle = dead ? '#71717a' : '#f59e0b'
      context.fillRect(x, y, CHAR_W, CHAR_H)

      context.fillStyle = dead ? '#52525b' : '#d97706'
      context.fillRect(x, y, 4, CHAR_H)

      context.fillStyle = dead ? '#a1a1aa' : '#fef3c7'
      context.fillRect(x + 5, y + 3, CHAR_W - 6, CHAR_H - 5)

      context.fillStyle = dead ? '#d4d4d8' : '#fde68a'
      for (let line = 0; line < 3; line += 1) {
        context.fillRect(x + 7, y + 6 + line * 6, CHAR_W - 10, 2)
      }

      if (!dead) {
        context.fillStyle = '#1e1b4b'
        context.fillRect(x + 8, y + 7, 2, 2)
        context.fillRect(x + 14, y + 7, 2, 2)
      } else {
        context.fillStyle = '#ef4444'
        context.fillRect(x + 7, y + 6, 4, 2)
        context.fillRect(x + 8, y + 6, 2, 4)
        context.fillRect(x + 13, y + 6, 4, 2)
        context.fillRect(x + 14, y + 6, 2, 4)
      }
    }

    const drawObstacle = (obstacle: Rect) => {
      context.fillStyle = '#dc2626'
      context.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h)
      context.fillStyle = '#fca5a5'
      context.fillRect(obstacle.x + 2, obstacle.y + 2, obstacle.w - 4, 3)
      context.fillStyle = 'rgba(251,146,60,0.45)'
      context.fillRect(obstacle.x + obstacle.w, obstacle.y + Math.floor(obstacle.h / 2) - 2, 16, 4)
    }

    const drawCoin = (coin: Coin) => {
      if (coin.taken) return

      const centerX = Math.floor(coin.x + coin.w / 2)
      const centerY = Math.floor(coin.y + coin.h / 2)

      context.fillStyle = '#fbbf24'
      context.fillRect(centerX - 2, centerY - 2, 4, 4)
      context.fillRect(centerX - 5, centerY - 1, 4, 2)
      context.fillRect(centerX + 1, centerY - 1, 4, 2)
      context.fillRect(centerX - 1, centerY - 5, 2, 4)
      context.fillRect(centerX - 1, centerY + 1, 2, 4)
      context.fillRect(centerX - 3, centerY - 3, 2, 2)
      context.fillRect(centerX + 1, centerY - 3, 2, 2)
      context.fillRect(centerX - 3, centerY + 1, 2, 2)
      context.fillRect(centerX + 1, centerY + 1, 2, 2)

      context.fillStyle = '#fef9c3'
      context.fillRect(centerX - 1, centerY - 1, 2, 2)
    }

    const drawKey = (label: string, centerX: number, centerY: number, width: number, height: number) => {
      context.fillStyle = 'rgba(100,80,220,0.6)'
      context.fillRect(centerX - width / 2, centerY - height / 2 + 4, width, height)

      context.fillStyle = 'rgba(255,255,255,0.18)'
      context.fillRect(centerX - width / 2, centerY - height / 2, width, height)

      context.fillStyle = 'rgba(255,255,255,0.08)'
      context.fillRect(centerX - width / 2 + 2, centerY - height / 2 + 2, width - 4, 2)

      context.fillStyle = 'rgba(167,139,250,0.7)'
      context.fillRect(centerX - width / 2, centerY - height / 2, width, 1)
      context.fillRect(centerX - width / 2, centerY - height / 2, 1, height)
      context.fillRect(centerX + width / 2 - 1, centerY - height / 2, 1, height)
      context.fillRect(centerX - width / 2, centerY + height / 2 - 1, width, 1)

      context.fillStyle = '#e2e8f0'
      context.font = 'bold 11px monospace'
      context.textAlign = 'center'
      context.fillText(label, centerX, centerY + 4)
    }

    const update = () => {
      tick += 1

      for (const star of backgroundStars) {
        star.x -= star.spd
        if (star.x < 0) {
          star.x = W
        }
      }

      if (state !== 'playing') return

      frame += 1
      score += 1
      speed = 3.5 + Math.floor(frame / 600) * 0.3

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
        const obstacleHeight = 20 + Math.floor(Math.random() * 22)
        obstacles.push({ x: W + 8, y: GROUND_Y - obstacleHeight, w: 15, h: obstacleHeight })
        nextObstacle = Math.max(
          42,
          62 + Math.floor(Math.random() * 70) - Math.floor(frame / 600) * 4
        )
      }

      nextCoin -= 1
      if (nextCoin <= 0) {
        if (Math.random() < 0.65) {
          const yOffset = 34 + Math.floor(Math.random() * 52)
          coins.push({ x: W + 8, y: GROUND_Y - yOffset - 12, w: 12, h: 12, taken: false })
        }
        nextCoin = 80 + Math.floor(Math.random() * 110)
      }

      obstacles = obstacles.filter((obstacle) => obstacle.x > -20)
      for (const obstacle of obstacles) {
        obstacle.x -= speed
        if (hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, obstacle)) {
          state = 'dead'
          if (score > best) {
            best = score
          }
          return
        }
      }

      coins = coins.filter((coin) => coin.x > -20)
      for (const coin of coins) {
        coin.x -= speed
        if (!coin.taken && hits({ x: CHAR_X, y: charY, w: CHAR_W, h: CHAR_H }, coin)) {
          coin.taken = true
          score += 50
        }
      }
    }

    const render = () => {
      context.fillStyle = '#1a1035'
      context.fillRect(0, 0, W, H)

      for (const star of backgroundStars) {
        context.fillStyle = `rgba(255,255,255,${0.25 + star.size * 0.15})`
        context.fillRect(star.x, star.y, star.size, star.size)
      }

      context.fillStyle = '#7c3aed'
      context.fillRect(0, GROUND_Y, W, 2)
      context.fillStyle = '#6d28d9'
      for (let x = 0; x < W; x += 8) {
        context.fillRect(x, GROUND_Y + 4, 4, 2)
      }

      for (const coin of coins) drawCoin(coin)
      for (const obstacle of obstacles) drawObstacle(obstacle)
      drawBook(CHAR_X, charY, state === 'dead')

      context.textAlign = 'right'
      context.fillStyle = '#fcd34d'
      context.font = 'bold 12px monospace'
      context.fillText(`SCORE ${score}`, W - 10, 18)

      if (best > 0) {
        context.fillStyle = 'rgba(252,211,77,0.45)'
        context.fillText(`BEST ${best}`, W - 10, 34)
      }

      context.textAlign = 'center'

      if (state === 'idle') {
        context.fillStyle = 'rgba(10,6,30,0.82)'
        context.fillRect(0, 0, W, H)

        context.fillStyle = '#fbbf24'
        context.font = 'bold 17px monospace'
        context.fillText('MAGIC BOOK RUNNER', W / 2, H / 2 - 38)

        context.fillStyle = '#a78bfa'
        context.font = '11px monospace'
        context.fillText('Jump over meteors and collect stars for bonus points', W / 2, H / 2 - 18)

        context.fillStyle = 'rgba(167,139,250,0.25)'
        context.fillRect(W / 2 - 100, H / 2 - 6, 200, 1)

        const blink = 0.55 + 0.45 * Math.sin(tick * 0.07)
        context.fillStyle = `rgba(255,255,255,${blink})`
        context.font = 'bold 13px monospace'
        context.fillText('PRESS TO START', W / 2, H / 2 + 16)

        drawKey('SPACE', W / 2 - 52, H / 2 + 44, 72, 22)
        drawKey('UP', W / 2 + 16, H / 2 + 44, 28, 22)

        context.fillStyle = 'rgba(148,163,184,0.7)'
        context.font = '10px monospace'
        context.fillText('or tap / click anywhere', W / 2, H / 2 + 74)
      }

      if (state === 'dead') {
        context.fillStyle = 'rgba(10,6,30,0.82)'
        context.fillRect(0, 0, W, H)

        context.fillStyle = '#f87171'
        context.font = 'bold 17px monospace'
        context.fillText('GAME OVER', W / 2, H / 2 - 28)

        context.fillStyle = '#fcd34d'
        context.font = '13px monospace'
        context.fillText(`Score: ${score}   Best: ${best}`, W / 2, H / 2 - 6)

        context.fillStyle = 'rgba(167,139,250,0.25)'
        context.fillRect(W / 2 - 80, H / 2 + 4, 160, 1)

        const blink = 0.55 + 0.45 * Math.sin(tick * 0.07)
        context.fillStyle = `rgba(255,255,255,${blink})`
        context.font = 'bold 12px monospace'
        context.fillText('PLAY AGAIN', W / 2, H / 2 + 22)

        drawKey('SPACE', W / 2 - 52, H / 2 + 46, 72, 22)
        drawKey('UP', W / 2 + 16, H / 2 + 46, 28, 22)

        context.fillStyle = 'rgba(148,163,184,0.7)'
        context.font = '10px monospace'
        context.fillText('or tap / click anywhere', W / 2, H / 2 + 74)
      }
    }

    const loop = () => {
      update()
      render()
      animationFrame = requestAnimationFrame(loop)
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.code === 'ArrowUp') {
        event.preventDefault()
        tryJump()
      }
    }

    const handlePointer = () => tryJump()
    const handleTouch = (event: TouchEvent) => {
      event.preventDefault()
      tryJump()
    }

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
      className="mb-5 block h-auto w-full max-w-3xl cursor-pointer select-none rounded-xl border border-white/20"
      style={{ imageRendering: 'pixelated', display: 'block', touchAction: 'none' }}
    />
  )
}

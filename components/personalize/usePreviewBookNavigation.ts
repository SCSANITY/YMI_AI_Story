'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

export type PreviewBookTurn = { id: number; identity: string; from: number; target: number; direction: 'next' | 'prev'; kind: 'open' | 'close' | 'page' }

export function usePreviewBookNavigation(identity: string | null, maxSpread: number, enabled: boolean) {
  const reduced = useReducedMotion()
  const [state, setState] = useState<{ identity: string | null; spread: number; turn: PreviewBookTurn | null }>({ identity, spread: 0, turn: null })
  const serial = useRef(0)
  const active = useRef<PreviewBookTurn | null>(null)
  const identityRef = useRef(identity)
  const current = state.identity === identity ? state : { identity, spread: 0, turn: null }
  if (state.identity !== identity) setState(current)
  useLayoutEffect(() => {
    identityRef.current = identity
    active.current = null
    return () => { active.current = null }
  }, [identity])
  const reset = useCallback(() => {
    active.current = null
    setState({ identity: identityRef.current, spread: 0, turn: null })
  }, [])
  // Reader opt-in only: preserve its bounds/readiness contract without changing
  // Preview's existing navigation or introducing a second spread state/timer.
  const reconcile = useCallback((maximum: number, available: boolean) => {
    const turn = active.current
    if (!available || turn && (turn.from > maximum || turn.target > maximum)) active.current = null
    setState(previous => {
      const spread = available ? Math.min(previous.spread, maximum) : 0
      const pending = available && previous.turn === active.current ? previous.turn : null
      return spread === previous.spread && pending === previous.turn ? previous : { ...previous, spread, turn: pending }
    })
  }, [])
  const go = useCallback((target: number) => {
    if (!identity || !enabled || active.current || target === current.spread || target < 0 || target > maxSpread) return
    if (reduced) { setState({ identity, spread: target, turn: null }); return }
    const turn: PreviewBookTurn = { id: ++serial.current, identity, from: current.spread, target,
      direction: target > current.spread ? 'next' : 'prev', kind: target === 0 ? 'close' : current.spread === 0 ? 'open' : 'page' }
    active.current = turn
    setState({ identity, spread: current.spread, turn })
  }, [identity, enabled, current.spread, maxSpread, reduced])
  const complete = useCallback((id: number) => {
    const turn = active.current
    if (!turn || turn.id !== id || turn.identity !== identityRef.current) return
    active.current = null
    // Absolute target captured at interaction time; no relative timeout commit.
    setState({ identity: turn.identity, spread: turn.target, turn: null })
  }, [])
  return { currentSpread: current.spread, transition: current.turn, isFlipping: Boolean(current.turn),
    flipDirection: current.turn?.direction ?? null, reset, complete, reconcile,
    turnPage: (direction: 'next' | 'prev') => go(current.spread + (direction === 'next' ? 1 : -1)),
    returnToCover: () => go(0) }
}

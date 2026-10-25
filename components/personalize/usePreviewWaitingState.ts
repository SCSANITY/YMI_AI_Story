'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { getPreviewGenerationEstimate } from './preview-generation-estimate'

export function usePreviewWaitingState(identity: string | null, startedAt: number | null, active: boolean) {
  const [state, setState] = useState({identity,elapsed:0,step:0})
  const [hidden,setHidden]=useState(false)
  const current=state.identity===identity?state:{identity,elapsed:0,step:0}
  if(state.identity!==identity)setState(current)
  const hold = useRef(0)
  const reduced = useReducedMotion()
  useEffect(() => { hold.current = 0 }, [identity])
  useEffect(() => {
    if (!active) return
    const origin = startedAt ?? Date.now()
    let timer: ReturnType<typeof setInterval> | null = null
    let last = Date.now(), stepElapsed = 0
    const tick = () => {
      const now = Date.now(), delta = now-last; last=now
      setState(previous=>previous.identity===identity?{...previous,elapsed:now-origin}:previous)
      if (reduced) return
      if (hold.current>0) { hold.current=Math.max(0,hold.current-delta); stepElapsed=0; return }
      stepElapsed+=delta
      if (stepElapsed>=8000) { stepElapsed=0; setState(previous=>previous.identity===identity?{...previous,step:(previous.step+1)%3}:previous) }
    }
    const visibility = () => {
      if (timer) clearInterval(timer)
      setHidden(document.hidden)
      timer=null;last=Date.now()
      if (!document.hidden) { tick(); timer=setInterval(tick,1000) }
    }
    visibility();document.addEventListener('visibilitychange',visibility)
    return()=>{if(timer)clearInterval(timer);document.removeEventListener('visibilitychange',visibility)}
  }, [identity,startedAt,active,reduced])
  const interact=useCallback((next?:number)=>{hold.current=15000;if(next!==undefined)setState(previous=>({...previous,step:next}))},[])
  return {...getPreviewGenerationEstimate(current.elapsed),step:current.step,interact,reduced:Boolean(reduced),hidden}
}

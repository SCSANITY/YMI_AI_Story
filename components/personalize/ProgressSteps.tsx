'use client'

import { memo, useMemo } from 'react'
import { Book, Check, Package, Sparkles, Wand2 } from 'lucide-react'

type ProgressStepsProps = {
  currentIndex: number
  placement?: 'page' | 'preview'
  labels: {
    story: string
    customize: string
    preview: string
    order: string
  }
}

function ProgressStepsComponent({ currentIndex, placement = 'page', labels }: ProgressStepsProps) {
  const steps = useMemo(() => ([
    { num: 1, label: labels.story, icon: Book },
    { num: 2, label: labels.customize, icon: Sparkles },
    { num: 3, label: labels.preview, icon: Wand2 },
    { num: 4, label: labels.order, icon: Package },
  ]), [labels.customize, labels.order, labels.preview, labels.story])

  const fillPercent = Math.max(0, Math.min(100, (currentIndex / (steps.length - 1)) * 100))

  return (
    <div className={`relative hidden md:block ${placement === 'preview' ? 'mb-6 w-full' : 'mx-auto mb-7 max-w-xl px-4'}`}>
      <div className="absolute left-7 right-7 top-5 z-0 h-1 overflow-hidden rounded-full bg-gray-100 shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
          style={{ width: `${fillPercent}%`, transition: 'width 500ms ease-in-out' }}
        />
      </div>

      <div className="relative z-10 flex w-full justify-between">
        {steps.map((step) => {
          const stepIndex = step.num - 1
          const isCompleted = currentIndex > stepIndex
          const isActive = currentIndex === stepIndex
          const StepIcon = step.icon

          return (
            <div key={step.num} className="group flex cursor-default flex-col items-center gap-3">
              <div className="relative">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-[3px] shadow-sm transition-all duration-300 ${
                    isActive
                      ? 'border-amber-200 bg-amber-500 text-white'
                      : isCompleted
                        ? 'border-orange-200 bg-orange-500 text-white'
                        : 'border-white/50 bg-white/60 text-gray-300 backdrop-blur-sm'
                  }`}
                >
                  {isCompleted && !isActive ? <Check className="h-5 w-5" /> : <StepIcon className="h-4 w-4" />}
                </div>
              </div>

              <span
                className={`text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-300 ${
                  isActive || isCompleted ? 'text-gray-800' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ProgressSteps = memo(ProgressStepsComponent)

'use client'

import React, { memo, useMemo } from 'react'
import { Book, Check, Package, Sparkles, Wand2 } from 'lucide-react'

type ProgressStepsProps = {
  currentIndex: number
  labels: {
    story: string
    customize: string
    preview: string
    order: string
  }
}

function ProgressStepsComponent({ currentIndex, labels }: ProgressStepsProps) {
  const steps = useMemo(() => ([
    { num: 1, label: labels.story, icon: Book },
    { num: 2, label: labels.customize, icon: Sparkles },
    { num: 3, label: labels.preview, icon: Wand2 },
    { num: 4, label: labels.order, icon: Package },
  ]), [labels.customize, labels.order, labels.preview, labels.story])

  const fillPercent = Math.max(0, Math.min(100, (currentIndex / (steps.length - 1)) * 100))

  return (
    <div className="relative mx-auto mb-10 hidden max-w-2xl px-4 md:block">
      <div className="absolute left-9 right-9 top-1/2 z-0 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-gray-100 shadow-inner">
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
                {isActive && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-amber-400/30" />
                )}

                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full border-4 shadow-md transition-all duration-500 ${
                    isActive
                      ? 'scale-110 border-amber-200 bg-amber-500 text-white'
                      : isCompleted
                        ? 'border-orange-200 bg-orange-500 text-white'
                        : 'border-white/50 bg-white/60 text-gray-300 backdrop-blur-sm'
                  }`}
                >
                  {isCompleted && !isActive ? <Check className="h-6 w-6" /> : <StepIcon className="h-5 w-5" />}
                </div>
              </div>

              <span
                className={`text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
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

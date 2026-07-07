'use client'

import type React from 'react'
import { BookOpen, CircleCheck, Download, ExternalLink, Package, Truck } from 'lucide-react'
import { motion } from 'framer-motion'
import { normalizeOrderStatus } from '@/lib/order-status'

type StageKey = 'confirmed' | 'printing' | 'shipped' | 'delivered'

const STAGES: { key: StageKey; icon: React.ElementType; label: string; desc: string }[] = [
  { key: 'confirmed', icon: Package, label: 'Order Confirmed', desc: 'Payment received & order locked in' },
  { key: 'printing', icon: BookOpen, label: 'Printing', desc: 'Your personalized storybook is being crafted' },
  { key: 'shipped', icon: Truck, label: 'Shipped', desc: 'On its way to you' },
  { key: 'delivered', icon: CircleCheck, label: 'Delivered', desc: 'Arrived at your door' },
]

const STATUS_TO_STAGE_INDEX: Record<string, number> = {
  paid: 0,
  production: 1,
  processing: 1,
  shipped: 2,
  delivered: 3,
}

const LOGISTICS_LABELS: Record<string, string> = {
  paid: 'Order Confirmed',
  production: 'Printing',
  processing: 'Printing',
  shipped: 'Shipped',
  delivered: 'Delivered',
}

type LogisticsTrackerProps = {
  status: string
  pdfUrl?: string | null
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
  updatedAt?: string | null
}

export function LogisticsTracker({
  status,
  pdfUrl,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
  updatedAt,
}: LogisticsTrackerProps) {
  const activeIdx = STATUS_TO_STAGE_INDEX[normalizeOrderStatus(status)] ?? 0
  const statusLabel = LOGISTICS_LABELS[status] || LOGISTICS_LABELS[normalizeOrderStatus(status)] || status

  return (
    <div className="glass-panel rounded-3xl p-5 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-600/80">Logistics</p>
          <h3 className="text-base font-bold text-gray-900 mt-0.5">Order Progress</h3>
          <p className="mt-1 text-xs text-slate-400">Current order status: {statusLabel}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {trackingUrl ? (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-200/60 transition hover:-translate-y-px hover:shadow-blue-300/60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Track shipment
            </a>
          ) : null}
          {pdfUrl && (
            <a
              href={pdfUrl}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-emerald-200/60 transition hover:-translate-y-px hover:shadow-emerald-300/60"
            >
              <Download className="h-3.5 w-3.5" />
              Download PDF
            </a>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-5 top-5 bottom-5 w-px bg-gray-100 md:left-0 md:right-0 md:top-5 md:bottom-auto md:w-auto md:h-px" />

        <motion.div
          className="absolute left-5 top-5 w-px bg-gradient-to-b from-amber-400 to-orange-400 origin-top md:left-0 md:top-5 md:w-auto md:h-px md:origin-left md:bg-gradient-to-r"
          initial={{ scaleY: 0, scaleX: 0 }}
          animate={{
            scaleY: activeIdx / (STAGES.length - 1),
            scaleX: activeIdx / (STAGES.length - 1),
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ bottom: '1.25rem' }}
        />

        <div className="relative flex flex-col gap-6 md:flex-row md:justify-between md:gap-0">
          {STAGES.map((stage, idx) => {
            const Icon = stage.icon
            const isDone = idx < activeIdx
            const isActive = idx === activeIdx
            const isPending = idx > activeIdx

            return (
              <div key={stage.key} className="flex items-start gap-4 md:flex-col md:items-center md:text-center md:flex-1">
                <div className="relative shrink-0 z-10">
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full bg-amber-400/30"
                      animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isDone ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-200/60' :
                    isActive ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-300/60 ring-4 ring-amber-100' :
                    'bg-white border-2 border-gray-100'
                  }`}>
                    <Icon className={`h-4 w-4 ${isPending ? 'text-gray-300' : 'text-white'}`} />
                  </div>
                </div>

                <div className="pt-1 md:pt-2">
                  <p className={`text-sm font-semibold leading-tight ${
                    isPending ? 'text-gray-300' : isActive ? 'text-amber-700' : 'text-gray-700'
                  }`}>
                    {stage.label}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-snug ${isPending ? 'text-gray-200' : 'text-slate-400'}`}>
                    {stage.desc}
                  </p>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-semibold text-amber-700">In progress</span>
                    </motion.div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {(trackingCarrier || trackingNumber || note || updatedAt) && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-slate-600">
          <div className="grid gap-2 md:grid-cols-2">
            {trackingCarrier ? <div><span className="font-semibold text-slate-800">Carrier:</span> {trackingCarrier}</div> : null}
            {trackingNumber ? <div><span className="font-semibold text-slate-800">Tracking:</span> {trackingNumber}</div> : null}
            {updatedAt ? <div><span className="font-semibold text-slate-800">Updated:</span> {new Date(updatedAt).toLocaleString()}</div> : null}
            {note ? <div className="md:col-span-2"><span className="font-semibold text-slate-800">Note:</span> {note}</div> : null}
          </div>
        </div>
      )}
    </div>
  )
}

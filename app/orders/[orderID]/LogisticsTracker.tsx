'use client'

import type React from 'react'
import { BookOpen, CircleCheck, FileText, Package, Truck } from 'lucide-react'
import { motion } from 'framer-motion'
import { normalizeOrderStatus } from '@/lib/order-status'
import { progressLabels, type OrderProgress, type ProgressStage } from '@/lib/order-progress'
import { ShippingDetailsPanel } from './ShippingDetailsPanel'
import type { ShippingDetails } from '@/lib/order-shipping'

const stageDetails: Record<ProgressStage, { icon: React.ElementType; desc: string }> = {
  confirmed: { icon: Package, desc: 'Payment received' },
  preview_ready: { icon: FileText, desc: 'Released PDFs appear with each book' },
  pdf_ready: { icon: FileText, desc: 'Download your books below' },
  printing: { icon: BookOpen, desc: 'Your books are being printed' },
  shipped: { icon: Truck, desc: 'On its way to you' },
  delivered: { icon: CircleCheck, desc: 'Arrived at your door' },
}
const physicalStages: ProgressStage[] = ['confirmed', 'preview_ready', 'printing', 'shipped', 'delivered']
const digitalStages: ProgressStage[] = ['confirmed', 'pdf_ready']
const legacyStages: ProgressStage[] = ['confirmed', 'printing', 'shipped', 'delivered']

type LogisticsTrackerProps = {
  status: string
  progress?: OrderProgress | null
  trackingCarrier?: string | null
  trackingNumber?: string | null
  trackingUrl?: string | null
  note?: string | null
  updatedAt?: string | null
  shippingDetails?: ShippingDetails | null
}

export function LogisticsTracker({
  status,
  progress,
  trackingCarrier,
  trackingNumber,
  trackingUrl,
  note,
  updatedAt,
  shippingDetails,
}: LogisticsTrackerProps) {
  const stored = normalizeOrderStatus(status)
  const stage = progress?.stage ?? (stored === 'production' ? 'printing' :
    stored === 'shipped' || stored === 'delivered' ? stored : 'confirmed')
  const digital = progress?.digitalOnly && (stage === 'confirmed' || stage === 'pdf_ready')
  const stages = digital ? digitalStages : progress ? physicalStages : legacyStages
  const activeIdx = stages.indexOf(stage)
  const complete = stage === 'pdf_ready' || stage === 'delivered'

  return (
    <div className="glass-panel rounded-3xl p-5 md:p-7 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900 mt-0.5">Order Progress</h3>
          {progress && progress.books > 1 && (
            <p className="mt-1 text-xs text-slate-600">
              PDFs ready: {progress.readyPdfs} / {progress.books}
              {progress.physicalBooks > 0 && <> · Released for print: {progress.releasedForPrint} / {progress.physicalBooks}</>}
            </p>
          )}
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-5 top-5 bottom-5 w-px bg-gray-100 md:left-0 md:right-0 md:top-5 md:bottom-auto md:w-auto md:h-px" />

        <motion.div
          className="absolute left-5 top-5 w-px bg-gradient-to-b from-amber-400 to-orange-400 origin-top md:left-0 md:top-5 md:w-auto md:h-px md:origin-left md:bg-gradient-to-r"
          initial={{ scaleY: 0, scaleX: 0 }}
          animate={{
            scaleY: activeIdx / (stages.length - 1),
            scaleX: activeIdx / (stages.length - 1),
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          style={{ bottom: '1.25rem' }}
        />

        <div className="relative flex flex-col gap-6 md:flex-row md:justify-between md:gap-0">
          {stages.map((key, idx) => {
            const Icon = stageDetails[key].icon
            const isDone = idx < activeIdx
            const isActive = idx === activeIdx
            const isPending = idx > activeIdx

            return (
              <div key={key} aria-current={isActive ? 'step' : undefined} className="flex items-start gap-4 md:flex-col md:items-center md:text-center md:flex-1">
                <div className="relative shrink-0 z-10">
                  {isActive && !complete && (
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
                    {progressLabels[key]}
                  </p>
                  <p className={`text-[11px] mt-0.5 leading-snug ${isPending ? 'text-gray-200' : 'text-slate-400'}`}>
                    {stageDetails[key].desc}
                  </p>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200/60 px-2 py-0.5"
                    >
                      <span className="text-xs font-semibold text-amber-700">{complete ? 'Complete' : 'In progress'}</span>
                    </motion.div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!digital && (trackingCarrier || trackingNumber || note || updatedAt) && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-slate-600">
          <div className="grid gap-2 md:grid-cols-2">
            {trackingCarrier ? <div><span className="font-semibold text-slate-800">Carrier:</span> {trackingCarrier}</div> : null}
            {trackingNumber ? <div><span className="font-semibold text-slate-800">Tracking:</span> {trackingNumber}</div> : null}
            {updatedAt ? <div><span className="font-semibold text-slate-800">Updated:</span> {new Date(updatedAt).toLocaleString()}</div> : null}
            {note ? <div className="md:col-span-2"><span className="font-semibold text-slate-800">Note:</span> {note}</div> : null}
          </div>
        </div>
      )}
      {['shipped','delivered'].includes(normalizeOrderStatus(status)) ? (
        <ShippingDetailsPanel details={shippingDetails} trackingUrl={trackingUrl} trackingNumber={trackingNumber} trackingCarrier={trackingCarrier} />
      ) : null}
    </div>
  )
}

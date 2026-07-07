'use client'

import { CircleCheck, Hourglass, Truck } from 'lucide-react'
import type { OrderTab } from './ordersTypes'

type OrderTabsProps = {
  activeTab: OrderTab
  counts: Record<OrderTab, number>
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  onChange: (tab: OrderTab) => void
}

export function OrderTabs({ activeTab, counts, t, onChange }: OrderTabsProps) {
  const tabs = [
    { key: 'shipping', icon: Truck, label: t('orders.inTransit'), count: counts.shipping },
    { key: 'unpaid', icon: Hourglass, label: t('orders.pendingPayment'), count: counts.unpaid },
    { key: 'finished', icon: CircleCheck, label: t('orders.completed'), count: counts.finished },
  ] as const

  return (
    <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-3">
      {tabs.map(({ key, icon: Icon, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
            activeTab === key
              ? 'border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50/60 text-amber-800 shadow-md shadow-amber-100/50'
              : 'border-white/60 bg-white/70 text-gray-600 hover:border-amber-200/60 hover:bg-white/90 backdrop-blur-sm'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className={`h-4 w-4 ${activeTab === key ? 'text-amber-600' : 'text-gray-400'}`} />
            {label}
          </div>
          <div className={`text-xs mt-1 font-medium ${activeTab === key ? 'text-amber-600' : 'text-gray-400'}`}>
            {count} order{count !== 1 ? 's' : ''}
          </div>
        </button>
      ))}
    </div>
  )
}

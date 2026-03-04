'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Package, Truck, CircleCheck } from 'lucide-react'
import { Button } from '@/components/Button'

type OrderItem = {
  cart_item_id: string
  creation_id: string
  quantity: number
  price_at_purchase?: number | null
  template_name?: string | null
  cover_url?: string | null
}

type OrderDetail = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  created_at?: string | null
  total?: number
  item_count?: number
  shipping_address?: {
    firstName?: string
    lastName?: string
    address?: string
    city?: string
    zip?: string
  } | null
  items?: OrderItem[]
}

export default function OrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = typeof params?.orderID === 'string' ? params.orderID : ''
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/orders?orderId=${orderId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => {
        if (cancelled) return
        const rows = Array.isArray(data?.orders) ? data.orders : []
        setOrder(rows[0] ?? null)
      })
      .catch(() => {
        if (cancelled) return
        setOrder(null)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [orderId])

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">Loading order...</div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">Order not found</h1>
          <p className="text-gray-600">We could not locate this order.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/orders')}>
            Back to Orders
          </Button>
        </div>
      </div>
    )
  }

  const address = order.shipping_address ?? {}
  const items = order.items ?? []
  const orderStatus = String(order.order_status ?? '').toLowerCase()
  const showTrackingPanel = orderStatus === 'paid' || orderStatus === 'processing' || orderStatus === 'shipped'

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-8">
      <div className="flex items-center gap-4">
        <Button
          size="sm"
          variant="outline"
          className="rounded-full px-4"
          onClick={() => router.push('/orders')}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="ml-2">Back</span>
        </Button>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Order</div>
          <div className="text-2xl font-title text-gray-900">{order.display_id ?? order.order_id}</div>
          <div className="text-xs text-gray-500 mt-1">Status: {order.order_status ?? 'unpaid'}</div>
        </div>
      </div>

      {showTrackingPanel && (
        <div className="bg-white rounded-2xl border border-amber-100 shadow-sm p-5">
          <div className="flex items-center gap-2 text-amber-700 font-semibold mb-2">
            {orderStatus === 'shipped' ? <CircleCheck className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
            Logistics
          </div>
          <p className="text-sm text-gray-600">
            Tracking timeline UI is reserved here. Current status:{' '}
            <span className="font-semibold">{order.order_status ?? 'processing'}</span>.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Items</h2>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.cart_item_id} className="flex items-center gap-4">
                <img
                  src={item.cover_url || '/Display.png'}
                  alt={item.template_name || 'Order item'}
                  className="w-20 h-24 rounded-xl object-cover bg-gray-100"
                />
                <div className="flex-1">
                  <div className="text-base font-semibold text-gray-900">
                    {item.template_name || 'Personalized storybook'}
                  </div>
                  <div className="text-xs text-gray-500">Qty {item.quantity}</div>
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  ${Number(item.price_at_purchase ?? 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Shipping</h3>
            <div className="text-sm text-gray-600 mt-2">
              <div>{`${address.firstName ?? ''} ${address.lastName ?? ''}`.trim() || '-'}</div>
              <div>{address.address ?? '-'}</div>
              <div>
                {address.city ?? ''} {address.zip ?? ''}
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Items</span>
              <span>{order.item_count ?? items.length}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-gray-900 mt-2">
              <span>Total</span>
              <span>${Number(order.total ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


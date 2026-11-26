import type { OrderSummary } from './ordersTypes'

export async function acknowledgeOrderMaterialNotices(customerId: string, orders: OrderSummary[], signal: AbortSignal) {
  const tasks = orders.flatMap(order => (order.material_tasks ?? []).map(({cart_item_id, voice, dedication}) =>
    ({order_id: order.order_id, cart_item_id, voice, dedication})))
  if (!tasks.length) return
  for (let start = 0; start < tasks.length; start += 20) {
    const response = await fetch('/api/user/material-notices/seen', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: {'Content-Type': 'application/json', 'X-YMI-Customer': customerId},
      body: JSON.stringify(tasks.slice(start, start + 20)),
    })
    if (!response.ok) throw new Error('Could not mark material notices as seen')
  }
  window.dispatchEvent(new Event('ymi-material-notices-read'))
  try {
    localStorage.setItem('ymi_material_notices_read', JSON.stringify([customerId, Date.now()]))
  } catch { /* The server receipt is already saved when browser storage is unavailable. */ }
}

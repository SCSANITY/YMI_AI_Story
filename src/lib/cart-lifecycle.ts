export type ActiveCartItemRow = {
  status?: string | null
  order_id?: string | null
}
export type ActiveCartOrderRow = {
  order_id: string
  order_status?: string | null
  payment_id?: string | null
}

export function filterActiveCartItems<T extends ActiveCartItemRow>(
  items: T[],
  orders: ActiveCartOrderRow[]
): T[] {
  const orderById = new Map(orders.map((order) => [order.order_id, order]))

  return items.filter((item) => {
    const status = String(item.status || '').trim().toLowerCase()
    const orderId = String(item.order_id || '').trim()
    if (!orderId) return status === 'cart'

    const order = orderById.get(orderId)
    if (order?.payment_id || (order && order.order_status !== 'unpaid')) return false
    if (status === 'ordered') {
      return Boolean(order && order.order_status === 'unpaid' && !order.payment_id)
    }
    return status === 'cart'
  })
}

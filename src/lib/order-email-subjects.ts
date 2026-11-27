export const ORDER_CONFIRMATION_SUBJECT = 'Order Confirmed: A Starlight Journey is Being Crafted with Love! ✦'
export const PDF_DELIVERY_PREVIEW_SUBJECT = 'Important Order Update: Your YMI Story Preview Is Ready'

export function pdfDeliverySubject(physical: boolean, orderLabel: string) {
  return physical ? PDF_DELIVERY_PREVIEW_SUBJECT : 'Your book is ready - ' + orderLabel
}

export function logisticsSubject(status: string, trackingUpdate: boolean, orderLabel: string) {
  if (trackingUpdate) return 'Updated tracking information - ' + orderLabel
  if (status === 'production') return 'Your YMI Story book is being printed - ' + orderLabel
  if (status === 'delivered') return 'Your YMI Story order has been delivered - ' + orderLabel
  return 'Your YMI Story order has shipped - ' + orderLabel
}

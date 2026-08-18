export const MAX_CART_ITEM_QUANTITY = 99

export function parseCartItemQuantity(value: unknown, fallback = 1) {
  const quantity = value === undefined || value === null ? fallback : Number(value)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_ITEM_QUANTITY) {
    throw new Error(`Quantity must be an integer between 1 and ${MAX_CART_ITEM_QUANTITY}`)
  }
  return quantity
}

export type LocaleCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'AUD'
  | 'CAD'
  | 'SGD'
  | 'HKD'
  | 'KRW'
  | 'CNY'

export const DEFAULT_EXCHANGE_RATES: Record<LocaleCurrency, number> = {
  USD: 1,
  EUR: 0.93,
  GBP: 0.79,
  JPY: 149,
  AUD: 1.52,
  CAD: 1.36,
  SGD: 1.34,
  HKD: 7.8,
  KRW: 1330,
  CNY: 7.2,
}

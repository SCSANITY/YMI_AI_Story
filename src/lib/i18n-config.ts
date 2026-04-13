import type { Language } from '@/types'

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

export type UiLocaleConfig = {
  code: Language
  label: string
  nativeLabel: string
  htmlLang: string
  intlLocale: string
  currency: LocaleCurrency
}

export const UI_LOCALES: Record<Language, UiLocaleConfig> = {
  en: {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
    htmlLang: 'en',
    intlLocale: 'en-US',
    currency: 'USD',
  },
  cn_s: {
    code: 'cn_s',
    label: 'Simplified Chinese',
    nativeLabel: '简体中文',
    htmlLang: 'zh-CN',
    intlLocale: 'zh-CN',
    currency: 'CNY',
  },
  cn_t: {
    code: 'cn_t',
    label: 'Traditional Chinese',
    nativeLabel: '繁體中文',
    htmlLang: 'zh-HK',
    intlLocale: 'zh-HK',
    currency: 'HKD',
  },
  ja: {
    code: 'ja',
    label: 'Japanese',
    nativeLabel: '日本語',
    htmlLang: 'ja',
    intlLocale: 'ja-JP',
    currency: 'JPY',
  },
  es: {
    code: 'es',
    label: 'Spanish',
    nativeLabel: 'Español',
    htmlLang: 'es',
    intlLocale: 'es-ES',
    currency: 'EUR',
  },
  ko: {
    code: 'ko',
    label: 'Korean',
    nativeLabel: '한국어',
    htmlLang: 'ko',
    intlLocale: 'ko-KR',
    currency: 'KRW',
  },
}

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

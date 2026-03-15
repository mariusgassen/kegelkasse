import { de } from './de'
import { en } from './en'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'de' | 'en'

const translations: Record<Locale, typeof de> = { de, en: en as typeof de }

interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useI18n = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'de',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'kegelkasse-locale' }
  )
)

export function t(key: keyof typeof de, locale?: Locale): string {
  const l = locale ?? useI18n.getState().locale
  return (translations[l] as Record<string, string>)[key] ?? (translations.de as Record<string, string>)[key] ?? key
}

// React hook version — re-renders on locale change
export function useT() {
  const locale = useI18n((s) => s.locale)
  return (key: keyof typeof de) => (translations[locale] as Record<string, string>)[key] ?? (translations.de as Record<string, string>)[key] ?? key
}

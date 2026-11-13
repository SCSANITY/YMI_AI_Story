import type { Metadata } from 'next'
import { LegalPageShell } from '@/components/legal/LegalPageShell'
import { CartReminderPreference } from './CartReminderPreference'

export const metadata: Metadata = { title: 'Email Preferences', robots: { index: false } }

export default function EmailPreferencesPage() {
  return (
    <LegalPageShell eyebrow="YMI Story Privacy" title="Email Preferences"
      description="Choose which optional emails you receive from YMI Story.">
      <CartReminderPreference />
    </LegalPageShell>
  )
}

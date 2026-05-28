import type { Metadata } from 'next'
import { AccountProfilePageClient } from '@/components/account/AccountProfilePageClient'

export const metadata: Metadata = {
  title: 'Account',
}

export default function AccountPage() {
  return <AccountProfilePageClient />
}

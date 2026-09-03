import { getAuthenticatedCustomer, requireAdminCustomer } from '@/lib/adminAuth'
import { AdminLoginClient } from '@/components/admin/AdminLoginClient'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ShieldX } from 'lucide-react'
import { redirect } from 'next/navigation'

/**
 * /admin/login — outside the (protected) route group, no auth guard.
 *
 * - Already an admin → redirect to dashboard
 * - Authenticated but not admin → show access-denied message
 * - Not authenticated → show login form
 */
export default async function AdminLoginPage() {
  // Already admin — skip login
  const admin = await requireAdminCustomer()
  if (admin) redirect('/admin/finals')

  // Authenticated but wrong role
  const customer = await getAuthenticatedCustomer()
  if (customer) {
    return (
      <main className="ymi-admin-theme min-h-dvh overflow-x-clip p-2 text-[var(--admin-ink)] sm:p-3 lg:p-4">
        <div className="mx-auto flex min-h-[calc(100dvh-1rem)] max-w-3xl items-center sm:min-h-[calc(100dvh-1.5rem)] lg:min-h-[calc(100dvh-2rem)]">
          <section className="admin-app w-full px-5 py-9 text-center sm:px-10 sm:py-12">
            <Image
              src="/logo.webp"
              alt="YMI Story"
              width={512}
              height={436}
              priority
              className="mx-auto mb-6 h-16 w-auto"
            />
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
              <ShieldX aria-hidden="true" className="h-7 w-7" />
            </div>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--admin-muted)]">YMI Operations</p>
            <h1 className="mt-2 text-3xl font-bold tracking-[-0.025em] text-[var(--admin-ink)] sm:text-4xl">Admin access required</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--admin-muted)]">
              <span className="font-semibold text-[var(--admin-ink)]">{customer.email}</span> is signed in, but this account is not authorized for the operations console. Contact a YMI Story administrator if you believe this is an error.
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-5 text-sm font-semibold text-[var(--admin-ink)] transition hover:bg-[var(--admin-panel-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Return to YMI Story
            </Link>
          </section>
        </div>
      </main>
    )
  }

  return <AdminLoginClient />
}

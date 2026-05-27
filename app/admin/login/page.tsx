import { getAuthenticatedCustomer, requireAdminCustomer } from '@/lib/adminAuth'
import { AdminLoginClient } from '@/components/admin/AdminLoginClient'
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
      <main className="min-h-screen bg-[#0b1120] px-4 py-10 text-white">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-xl items-center">
          <div className="w-full rounded-[32px] border border-white/10 bg-white/[0.06] p-8 text-center shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Admin</p>
            <h1 className="mt-4 text-3xl font-bold">Access denied</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This account is signed in but is not marked as an admin account.
              Ask an administrator to set{' '}
              <span className="font-semibold text-white">{customer.email}</span> to{' '}
              <span className="font-mono text-amber-300">role = admin</span>.
            </p>
          </div>
        </section>
      </main>
    )
  }

  return <AdminLoginClient />
}

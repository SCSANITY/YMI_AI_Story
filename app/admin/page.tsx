import { redirect } from 'next/navigation'

/**
 * /admin — legacy entry point, now a redirect.
 *
 * Auth guard lives in app/admin/(protected)/layout.tsx.
 * This redirect is also reached after Google OAuth callback (which lands on /admin).
 */
export default function AdminPage() {
  redirect('/admin/finals')
}

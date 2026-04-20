import type { Metadata } from 'next'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { InviteCodeClient } from './InviteCodeClient'

async function loadInviteData(code: string) {
  const { data } = await supabaseAdmin
    .from('referral_codes')
    .select('code, template_id, expires_at, status')
    .eq('code', code)
    .maybeSingle()

  return data
}

function isInviteUnavailable(invite: Awaited<ReturnType<typeof loadInviteData>>) {
  return (
    !invite?.code ||
    invite.status === 'cancelled' ||
    invite.status === 'expired' ||
    new Date(invite.expires_at).getTime() <= Date.now()
  )
}

export async function generateMetadata(
  props: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const params = await props.params
  const code = String(params.code || '').trim().toUpperCase()
  const invite = code ? await loadInviteData(code) : null
  const imageUrl = code ? buildAbsoluteUrl(`/invite/${code}/image`) : undefined

  return {
    title: invite?.code ? `Use ${invite.code} on your first YMI order` : 'YMI Invite',
    description: 'Unlock $5 off your first personalized YMI storybook.',
    openGraph: imageUrl
      ? {
          title: invite?.code ? `Use ${invite.code} on your first YMI order` : 'YMI Invite',
          description: 'Unlock $5 off your first personalized YMI storybook.',
          images: [{ url: imageUrl }],
        }
      : undefined,
    twitter: imageUrl
      ? {
          card: 'summary_large_image',
          title: invite?.code ? `Use ${invite.code} on your first YMI order` : 'YMI Invite',
          description: 'Unlock $5 off your first personalized YMI storybook.',
          images: [imageUrl],
        }
      : undefined,
  }
}

export default async function InvitePage(
  props: { params: Promise<{ code: string }> }
) {
  const params = await props.params
  const code = String(params.code || '').trim().toUpperCase()
  const invite = code ? await loadInviteData(code) : null
  const isExpired = isInviteUnavailable(invite)

  return (
    <div className="min-h-[calc(100vh-84px)] bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-10 md:px-8 md:py-14">
      {!isExpired && invite?.code ? <InviteCodeClient code={invite.code} /> : null}
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-amber-100 bg-white shadow-xl shadow-amber-100/40">
        <div className="grid gap-8 p-6 md:grid-cols-[1.05fr_0.95fr] md:p-10">
          <div className="overflow-hidden rounded-[28px] border border-amber-100 bg-amber-50/30">
            {!isExpired && invite?.code ? (
              <img
                src={buildAbsoluteUrl(`/invite/${invite.code}/image`)}
                alt="YMI invite"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-[320px] items-center justify-center bg-gray-50 text-sm text-gray-400">
                Invite unavailable
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              YMI Invite
            </div>
            <h1 className="mt-5 text-4xl font-title text-gray-900 md:text-5xl">
              {isExpired ? 'This invite is no longer available' : 'Save $5 on your first YMI order'}
            </h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              {isExpired
                ? 'This invite link has expired or has already been used. You can still browse the collection and create your own story.'
                : 'Use the invite code below during checkout. When your first order is paid, your friend earns a reward too.'}
            </p>

            {!isExpired && invite?.code ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Your invite code
                </div>
                <div className="mt-2 font-mono text-lg font-bold tracking-[0.24em] text-gray-900">
                  {invite.code}
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={invite?.code ? `/books?ref=${encodeURIComponent(invite.code)}` : '/books'}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02]"
              >
                Browse Books
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-8 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

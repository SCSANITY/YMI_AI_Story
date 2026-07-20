'use client'

import {
  BookOpen,
  Gift,
  Heart,
  LogOut,
  Package,
  PencilLine,
  Shield,
} from 'lucide-react'
import type { User } from '@/types'
import type { NavNoticeCounts, NavNoticeModule } from './useNavNoticeCounts'

function formatBadgeCount(count: number) {
  return count > 9 ? '9+' : String(count)
}

function ModuleBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-none text-slate-950 shadow-sm shadow-amber-200/70">
      {formatBadgeCount(count)}
    </span>
  )
}

type NavbarUserMenuProps = {
  user: User
  isOpen: boolean
  totalNewCount: number
  newCounts: NavNoticeCounts
  t: (key: string, params?: Record<string, string | number>) => string
  onToggle: () => void
  onClose: () => void
  onNavigate: (path: string) => void
  onOpenRewards: () => void
  onLogout: () => void
  onMarkModuleSeen: (module: NavNoticeModule) => void
}

export function NavbarUserMenu({
  user,
  isOpen,
  totalNewCount,
  newCounts,
  t,
  onToggle,
  onClose,
  onNavigate,
  onOpenRewards,
  onLogout,
  onMarkModuleSeen,
}: NavbarUserMenuProps) {
  return (
    <div className="flex items-center">
      <button
        onClick={onToggle}
        className="relative flex items-center gap-2 transition-transform hover:scale-105 focus:outline-none"
      >
        {/* OAuth avatars can come from arbitrary domains; keep native img instead of expanding Next image remote allowlists. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user.avatar}
          alt={user.name}
          className="h-8 w-8 rounded-full border border-gray-200 object-cover shadow-sm"
        />
        {totalNewCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {formatBadgeCount(totalNewCount)}
          </span>
        ) : null}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-[160] mt-2 w-56 animate-in rounded-xl border border-white/85 bg-white/92 py-1 shadow-[0_14px_38px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-2xl backdrop-saturate-150 duration-200 fade-in slide-in-from-top-2">
          <div className="border-b border-gray-50 px-4 py-2">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="truncate text-xs text-gray-500">{user.email}</p>
          </div>

          <button
            onClick={() => {
              onNavigate('/account')
              onClose()
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <PencilLine className="h-4 w-4" />
            {t('navbar.myAccount')}
          </button>

          <button
            onClick={() => {
              onMarkModuleSeen('favorites')
              onNavigate('/favorites')
              onClose()
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Heart className="h-4 w-4" />
            <span>{t('navbar.favorites')}</span>
            <ModuleBadge count={newCounts.favorites} />
          </button>

          <button
            onClick={() => {
              onClose()
              onMarkModuleSeen('rewards')
              onOpenRewards()
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              {t('navbar.myRewards')}
            </span>
            <ModuleBadge count={newCounts.rewards} />
          </button>

          <button
            onClick={() => {
              onMarkModuleSeen('orders')
              onNavigate('/orders')
              onClose()
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Package className="h-4 w-4" />
            <span>{t('navbar.myOrders')}</span>
            <ModuleBadge count={newCounts.orders} />
          </button>

          <button
            onClick={() => {
              onMarkModuleSeen('books')
              onNavigate('/my-books')
              onClose()
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            <BookOpen className="h-4 w-4" />
            <span>{t('navbar.myBooks')}</span>
            <ModuleBadge count={newCounts.books} />
          </button>

          {user.role === 'admin' ? (
            <button
              onClick={() => {
                onNavigate('/admin')
                onClose()
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-amber-50"
            >
              <Shield className="h-4 w-4" />
              Admin Dashboard
            </button>
          ) : null}

          <button
            onClick={() => {
              onLogout()
              onClose()
            }}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            {t('navbar.logOut')}
          </button>
        </div>
      )}
    </div>
  )
}

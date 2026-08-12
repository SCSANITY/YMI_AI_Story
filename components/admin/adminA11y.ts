import type { KeyboardEvent } from 'react'

const TAB_NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

export function handleAdminTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if (!TAB_NAVIGATION_KEYS.has(event.key)) return

  const tabList = event.currentTarget.closest('[role="tablist"]')
  const tabs = Array.from(
    tabList?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)') ?? []
  )
  if (tabs.length === 0) return

  const currentIndex = tabs.indexOf(event.currentTarget)
  if (currentIndex < 0) return

  event.preventDefault()
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length

  tabs[nextIndex]?.focus()
  tabs[nextIndex]?.click()
}

import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export const adminFieldClass =
  'admin-v2-field mt-2 w-full rounded-lg px-3 text-sm outline-none disabled:cursor-wait disabled:opacity-60'

export const adminLabelClass =
  'block text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]'

export function AdminPage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('admin-v2-page', className)} {...props} />
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="admin-v2-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        <span
          aria-hidden="true"
          className="mt-1 hidden h-12 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[var(--admin-accent)] to-[var(--admin-accent-dp)] sm:block"
        />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--admin-page-muted)]">
            {eyebrow}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-[-0.01em] text-[var(--admin-page-ink)] sm:text-[1.85rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-page-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function AdminPanel({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={classes('admin-v2-panel', className)} {...props} />
}

type ButtonTone = 'primary' | 'secondary' | 'danger' | 'quiet' | 'dark'

export function AdminButton({
  className,
  tone = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      className={classes('admin-v2-button', `admin-v2-button--${tone}`, className)}
      {...props}
    />
  )
}

export function AdminIconButton({
  className,
  tone = 'secondary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone }) {
  return (
    <button
      className={classes(
        'admin-v2-button admin-v2-icon-button',
        `admin-v2-button--${tone}`,
        className
      )}
      {...props}
    />
  )
}

export type AdminStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'inverse'

export function AdminStatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: AdminStatusTone
  className?: string
}) {
  return (
    <span className={classes('admin-v2-status', `admin-v2-status--${tone}`, className)}>
      {children}
    </span>
  )
}

export function AdminNotice({
  children,
  tone = 'info',
  className,
  role,
}: {
  children: ReactNode
  tone?: 'success' | 'warning' | 'danger' | 'info'
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      className={classes('admin-v2-notice', `admin-v2-notice--${tone}`, className)}
    >
      {children}
    </div>
  )
}

export function AdminEmptyState({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('admin-v2-empty', className)} {...props} />
}

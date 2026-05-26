'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  BarChart3,
  BookMarked,
  Eye,
  EyeOff,
  ImagePlus,
  FileText as FileTextIcon,
  LayoutDashboard,
  Link as LinkIcon,
  Megaphone,
  Pencil,
  Plus,
  Save,
  ToggleLeft,
  UploadCloud,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { FinalReviewPanel } from '@/components/admin/FinalReviewPanel'
import { DEFAULT_CUSTOMIZE_ACCESS_MESSAGE, type CustomizeAccessSettings } from '@/lib/customize-access'

type BlogPostStatus = 'draft' | 'published' | 'hidden' | 'archived'
type AdminTab = 'list' | 'edit' | 'preview'
type AdminSection = 'announcements' | 'finals' | 'service'

type BlogPost = {
  post_id: string
  title: string
  body: string
  image_storage_paths: string[]
  image_urls: string[]
  links: Array<{ label: string; url: string }>
  status: BlogPostStatus
  like_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

type FormState = {
  postId: string | null
  title: string
  body: string
  status: BlogPostStatus
  imageStoragePaths: string[]
  imagePreviewUrls: string[]
  links: Array<{ label: string; url: string }>
}

type CreatorPromoConfig = {
  enabled: boolean
  suffix: string
  discount_amount_usd: number
  first_order_only: boolean
}

const emptyForm: FormState = {
  postId: null,
  title: '',
  body: '',
  status: 'draft',
  imageStoragePaths: [],
  imagePreviewUrls: [],
  links: [],
}

const navItems = [
  { label: 'Announcements', icon: Megaphone, section: 'announcements' as const, active: true },
  { label: 'Final Review', icon: FileTextIcon, section: 'finals' as const, active: true },
  { label: 'Service Control', icon: ToggleLeft, section: 'service' as const, active: true },
  { label: 'Data Overview', icon: BarChart3, section: null, active: false },
  { label: 'Banner Manager', icon: LayoutDashboard, section: null, active: false },
  { label: 'Book Packages', icon: BookMarked, section: null, active: false },
]

function statusBadge(status: BlogPostStatus) {
  const classes = {
    published: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/20',
    draft: 'bg-slate-500/12 text-slate-300 border-slate-400/20',
    hidden: 'bg-amber-500/12 text-amber-300 border-amber-400/20',
    archived: 'bg-zinc-500/14 text-zinc-300 border-zinc-400/20',
  }
  return classes[status]
}

function imageGridClass(count: number) {
  if (count <= 1) return 'grid-cols-1 max-w-[15rem]'
  if (count === 2) return 'grid-cols-2 max-w-[18rem]'
  if (count === 4) return 'grid-cols-2 max-w-[18rem]'
  return 'grid-cols-3 max-w-[20rem]'
}

function normalizeLinks(links: Array<{ label: string; url: string }>) {
  return links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.url)
}

function AnnouncementPreview({ form }: { form: FormState }) {
  const images = form.imagePreviewUrls.filter(Boolean).slice(0, 9)
  const links = normalizeLinks(form.links)

  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-600">YMI Story</p>
          <h3 className="mt-2 text-2xl font-bold leading-tight">
            {form.title.trim() || 'Announcement title'}
          </h3>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Preview
        </span>
      </div>

      <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">
        {form.body.trim() || 'Write announcement content to preview how it will appear on the public Blog board.'}
      </p>

      {images.length ? (
        <div className={`mt-5 grid gap-2 ${imageGridClass(images.length)}`}>
          {images.map((url, index) => (
            <div key={`${url}-${index}`} className="aspect-square overflow-hidden rounded-xl bg-amber-50">
              <img src={url} alt={`Preview image ${index + 1}`} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}

      {links.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((link, index) => (
            <span
              key={`${link.url}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              {link.label || link.url}
              <LinkIcon className="h-3.5 w-3.5" />
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between border-t border-amber-100 pt-4">
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600">
          0 likes
        </span>
        <span className="text-xs text-slate-400">Public users can like this post.</span>
      </div>
    </article>
  )
}

export function AdminDashboardClient({ adminName, adminEmail }: { adminName: string; adminEmail: string }) {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [mobileTab, setMobileTab] = useState<AdminTab>('edit')
  const [section, setSection] = useState<AdminSection>('announcements')
  const [customizeAccess, setCustomizeAccess] = useState<CustomizeAccessSettings>({
    enabled: true,
    message: DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
  })
  const [customizeAccessLoading, setCustomizeAccessLoading] = useState(false)
  const [customizeAccessSaving, setCustomizeAccessSaving] = useState(false)
  const [creatorPromoConfig, setCreatorPromoConfig] = useState<CreatorPromoConfig>({
    enabled: true,
    suffix: '-YMI',
    discount_amount_usd: 5,
    first_order_only: true,
  })
  const [creatorPromoSaving, setCreatorPromoSaving] = useState(false)

  const editingPost = useMemo(
    () => posts.find((post) => post.post_id === form.postId) ?? null,
    [form.postId, posts]
  )

  const loadPosts = async () => {
    setLoading(true)
    const response = await fetch('/api/admin/blog-posts', {
      credentials: 'include',
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data?.error || 'Failed to load announcements')
      setLoading(false)
      return
    }
    setPosts(Array.isArray(data?.posts) ? data.posts : [])
    setError('')
    setLoading(false)
  }

  useEffect(() => {
    void loadPosts()
  }, [])

  useEffect(() => {
    if (section !== 'service') return

    let active = true
    const loadCustomizeAccess = async () => {
      setCustomizeAccessLoading(true)
      try {
        const [accessResponse, promoResponse] = await Promise.all([
          fetch('/api/admin/customize-access', {
            credentials: 'include',
            cache: 'no-store',
          }),
          fetch('/api/admin/creator-promo-config', {
            credentials: 'include',
            cache: 'no-store',
          }),
        ])
        const data = await accessResponse.json().catch(() => ({}))
        const promoData = await promoResponse.json().catch(() => ({}))
        if (!active) return
        if (!accessResponse.ok) return
        const next = data?.customizeAccess
        setCustomizeAccess({
          enabled: Boolean(next?.enabled ?? true),
          message: String(next?.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE),
        })
        if (promoResponse.ok && promoData?.config) {
          setCreatorPromoConfig({
            enabled: Boolean(promoData.config.enabled ?? true),
            suffix: String(promoData.config.suffix ?? '-YMI'),
            discount_amount_usd: Number(promoData.config.discount_amount_usd ?? 5),
            first_order_only: promoData.config.first_order_only !== false,
          })
        }
      } finally {
        if (active) setCustomizeAccessLoading(false)
      }
    }

    void loadCustomizeAccess()

    return () => {
      active = false
    }
  }, [section])

  const startEdit = (post: BlogPost) => {
    setForm({
      postId: post.post_id,
      title: post.title,
      body: post.body,
      status: post.status,
      imageStoragePaths: post.image_storage_paths ?? [],
      imagePreviewUrls: post.image_urls ?? [],
      links: Array.isArray(post.links) ? post.links : [],
    })
    setMessage('')
    setError('')
    setMobileTab('edit')
  }

  const resetForm = () => {
    setForm(emptyForm)
    setMessage('')
    setError('')
    setMobileTab('edit')
  }

  const updateLink = (index: number, key: 'label' | 'url', value: string) => {
    setForm((prev) => {
      const links = [...prev.links]
      links[index] = { ...links[index], [key]: value }
      return { ...prev, links }
    })
  }

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    setError('')

    try {
      const nextPaths: string[] = []
      const nextPreviewUrls: string[] = []
      for (const file of Array.from(files)) {
        const response = await fetch('/api/admin/blog-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const uploadSpec = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(uploadSpec?.error || 'Failed to create upload URL')

        const { error: uploadError } = await supabase.storage
          .from(uploadSpec.bucket || 'raw-private')
          .uploadToSignedUrl(uploadSpec.storage_path, uploadSpec.token, file)
        if (uploadError) throw new Error('Failed to upload image')
        nextPaths.push(uploadSpec.storage_path)
        nextPreviewUrls.push(URL.createObjectURL(file))
      }

      setForm((prev) => ({
        ...prev,
        imageStoragePaths: [...prev.imageStoragePaths, ...nextPaths].slice(0, 9),
        imagePreviewUrls: [...prev.imagePreviewUrls, ...nextPreviewUrls].slice(0, 9),
      }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const savePost = async () => {
    setSaving(true)
    setError('')
    setMessage('')

    const payload = {
      title: form.title,
      body: form.body,
      status: form.status,
      imageStoragePaths: form.imageStoragePaths,
      links: normalizeLinks(form.links),
    }

    const response = await fetch(
      form.postId ? `/api/admin/blog-posts/${form.postId}` : '/api/admin/blog-posts',
      {
        method: form.postId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }
    )
    const data = await response.json().catch(() => ({}))
    setSaving(false)

    if (!response.ok) {
      setError(data?.error || 'Failed to save announcement')
      return
    }

    setMessage(form.postId ? 'Announcement updated.' : 'Announcement created.')
    setForm(emptyForm)
    setMobileTab('list')
    await loadPosts()
  }

  const quickStatus = async (post: BlogPost, status: BlogPostStatus) => {
    const response = await fetch(`/api/admin/blog-posts/${post.post_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    })
    if (response.ok) await loadPosts()
  }

  const toggleCustomizeAccess = async () => {
    setCustomizeAccessSaving(true)
    try {
      const response = await fetch('/api/admin/customize-access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !customizeAccess.enabled }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to update customize access')
        return
      }
      const next = data?.customizeAccess
      setCustomizeAccess({
        enabled: Boolean(next?.enabled ?? !customizeAccess.enabled),
        message: String(next?.message ?? customizeAccess.message ?? DEFAULT_CUSTOMIZE_ACCESS_MESSAGE),
      })
      setMessage(`Customize access ${next?.enabled ? 'opened' : 'closed'}.`)
      setError('')
    } finally {
      setCustomizeAccessSaving(false)
    }
  }

  const saveCreatorPromoConfig = async () => {
    setCreatorPromoSaving(true)
    try {
      const response = await fetch('/api/admin/creator-promo-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: creatorPromoConfig.enabled,
          suffix: creatorPromoConfig.suffix,
          discountAmountUsd: creatorPromoConfig.discount_amount_usd,
          firstOrderOnly: creatorPromoConfig.first_order_only,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Failed to update creator promo config')
        return
      }
      if (data?.config) setCreatorPromoConfig(data.config)
      setMessage('Creator promo config updated.')
      setError('')
    } finally {
      setCreatorPromoSaving(false)
    }
  }

  const editorPanel = (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Blog / Announcements</p>
          <h2 className="mt-1 text-2xl font-bold text-white">{form.postId ? 'Edit announcement' : 'Create announcement'}</h2>
        </div>
        {form.postId ? (
          <button type="button" onClick={resetForm} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/16">
            New
          </button>
        ) : null}
      </div>

      <label className="block text-sm font-semibold text-slate-200">
        Title
        <input
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
          placeholder="Announcement title"
        />
      </label>

      <label className="mt-4 block text-sm font-semibold text-slate-200">
        Body
        <textarea
          value={form.body}
          onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
          className="mt-2 min-h-48 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
          placeholder="Write the announcement..."
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block text-sm font-semibold text-slate-200">
          Status
          <select
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as BlogPostStatus }))}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/70"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="archived">Archived</option>
          </select>
        </label>

        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/16">
          <ImagePlus className="h-4 w-4" />
          {uploading ? 'Uploading...' : 'Add images'}
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => void uploadImages(event.target.files)} />
        </label>
      </div>

      {form.imageStoragePaths.length ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {form.imageStoragePaths.map((path, index) => (
            <div key={`${path}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.08]">
              {form.imagePreviewUrls[index] ? (
                <img src={form.imagePreviewUrls[index]} alt={`Uploaded image ${index + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-slate-400">Image {index + 1}</span>
              )}
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    imageStoragePaths: prev.imageStoragePaths.filter((_, pathIndex) => pathIndex !== index),
                    imagePreviewUrls: prev.imagePreviewUrls.filter((_, pathIndex) => pathIndex !== index),
                  }))
                }
                className="absolute right-1 top-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-xs text-white shadow hover:bg-red-500"
                aria-label="Remove image"
              >
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-200">Links</p>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, links: [...prev.links, { label: '', url: '' }] }))}
            className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/16"
          >
            <Plus className="h-3.5 w-3.5" />
            Add link
          </button>
        </div>
        {form.links.map((link, index) => (
          <div key={`link-${index}`} className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]">
            <input
              value={link.label}
              onChange={(event) => updateLink(index, 'label', event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
              placeholder="Label"
            />
            <input
              value={link.url}
              onChange={(event) => updateLink(index, 'url', event.target.value)}
              className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
              placeholder="https://..."
            />
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, links: prev.links.filter((_, linkIndex) => linkIndex !== index) }))}
              className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-red-500/16 hover:text-red-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-red-500/14 px-4 py-3 text-sm text-red-200">{error}</p> : null}
      {message ? <p className="mt-4 rounded-2xl bg-emerald-500/14 px-4 py-3 text-sm text-emerald-200">{message}</p> : null}

      <button
        type="button"
        onClick={savePost}
        disabled={saving || uploading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-950/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <UploadCloud className="h-4 w-4 animate-pulse" /> : <Save className="h-4 w-4" />}
        {saving ? 'Saving...' : form.postId ? 'Save changes' : 'Create announcement'}
      </button>

      {editingPost ? <p className="mt-3 text-xs text-slate-500">Editing: {editingPost.title}</p> : null}
    </section>
  )

  const listPanel = (
    <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">All announcements</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Manage content</h2>
        </div>
        <button type="button" onClick={resetForm} className="rounded-full bg-amber-400/12 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/18">
          New
        </button>
      </div>

      {loading ? (
        <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">No announcements yet.</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <article key={post.post_id} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadge(post.status)}`}>
                    {post.status}
                  </span>
                  <h3 className="mt-2 text-lg font-bold text-white">{post.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-400">{post.body || 'No body text'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(post)}
                  className="rounded-full bg-white/10 p-2 text-slate-300 hover:bg-amber-400/16 hover:text-amber-200"
                  aria-label="Edit announcement"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{post.image_storage_paths?.length ?? 0} images</span>
                <span>{post.links?.length ?? 0} links</span>
                <span>{post.like_count ?? 0} likes</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => quickStatus(post, 'published')} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/18">
                  <Eye className="h-3.5 w-3.5" />
                  Publish
                </button>
                <button type="button" onClick={() => quickStatus(post, 'hidden')} className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/18">
                  <EyeOff className="h-3.5 w-3.5" />
                  Hide
                </button>
                <button type="button" onClick={() => quickStatus(post, 'archived')} className="inline-flex items-center gap-1 rounded-full bg-slate-500/14 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-500/20">
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )

  const previewPanel = (
    <aside className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-auto">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Live Preview</p>
      <h2 className="mt-1 text-2xl font-bold text-white">Public Blog card</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        This approximates how the announcement will appear on the public Blog page.
      </p>
      <div className="mt-5">
        <AnnouncementPreview form={form} />
      </div>
    </aside>
  )

  const servicePanel = (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : message ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>
      ) : null}

      {/* ── Customize Access ── */}
      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Access Control</p>
            <h2 className="mt-1 text-xl font-bold text-white">Customize access</h2>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
              Block new Customize sessions during private beta windows.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void toggleCustomizeAccess()}
              disabled={customizeAccessSaving || customizeAccessLoading}
              className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                customizeAccess.enabled
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                  : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${customizeAccess.enabled ? 'bg-white' : 'bg-slate-400'}`} />
              {customizeAccessSaving ? 'Saving...' : customizeAccess.enabled ? 'Open — Close access' : 'Closed — Open access'}
            </button>
            <p className="text-[10px] text-slate-500">
              {customizeAccess.enabled ? 'Users can enter Customize.' : 'Users see the private beta notice.'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Blocked message preview</p>
          <p className="mt-1.5 text-sm leading-7 text-slate-300">{customizeAccess.message}</p>
        </div>
      </section>

      {/* ── Creator Promo ── */}
      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-6 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Creator Promo</p>
            <h2 className="mt-1 text-xl font-bold text-white">Signature code settings</h2>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-slate-400">
              Controls Collaboration page promo code generation and default checkout discount.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreatorPromoConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-5 text-sm font-bold transition ${
              creatorPromoConfig.enabled
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 hover:bg-emerald-400'
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${creatorPromoConfig.enabled ? 'bg-white' : 'bg-slate-400'}`} />
            {creatorPromoConfig.enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Code suffix
            <input
              value={creatorPromoConfig.suffix}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, suffix: event.target.value }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70 normal-case"
            />
          </label>
          <label className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Discount (USD)
            <input
              type="number"
              min="1"
              step="0.5"
              value={creatorPromoConfig.discount_amount_usd}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, discount_amount_usd: Number(event.target.value) }))}
              className="mt-2 h-11 w-full rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-sm font-semibold text-white outline-none focus:border-amber-300/70"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.06]">
            <input
              type="checkbox"
              checked={creatorPromoConfig.first_order_only}
              onChange={(event) => setCreatorPromoConfig((prev) => ({ ...prev, first_order_only: event.target.checked }))}
              className="h-4 w-4 accent-amber-400"
            />
            First order only
          </label>
        </div>

        <div className="mt-5 flex justify-end border-t border-white/[0.07] pt-5">
          <button
            type="button"
            onClick={() => void saveCreatorPromoConfig()}
            disabled={creatorPromoSaving}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {creatorPromoSaving ? 'Saving...' : 'Save settings'}
          </button>
        </div>
      </section>
    </div>
  )

  return (
    <main className="min-h-screen bg-[#0b1120] text-white">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex flex-col border-b border-white/10 bg-slate-950/80 p-4 backdrop-blur-2xl lg:min-h-screen lg:border-b-0 lg:border-r lg:p-5">
          <div className="flex items-center gap-3 rounded-3xl bg-white/[0.06] p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-950">
              Y
            </div>
            <div>
              <p className="text-sm font-bold">YMI Admin</p>
              <p className="text-xs text-slate-500">Internal dashboard</p>
            </div>
          </div>

          <nav className="mt-6 flex-1 space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isSelected = item.section ? section === item.section : false
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={!item.active || !item.section}
                  onClick={() => {
                    if (item.section) setSection(item.section)
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20'
                      : item.active
                        ? 'text-slate-200 hover:bg-white/[0.08]'
                      : 'cursor-not-allowed text-slate-600'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isSelected ? '' : item.active ? 'text-slate-400' : 'text-slate-700'}`} />
                  {item.label}
                  {!item.active ? <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wide text-slate-600">Soon</span> : null}
                </button>
              )
            })}
          </nav>

          {/* Admin identity — pinned to sidebar bottom */}
          <div className="mt-6 border-t border-white/[0.08] pt-4">
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/50 to-orange-500/50 text-sm font-bold text-white">
                {adminName[0]?.toUpperCase() ?? 'A'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">{adminName}</p>
                {adminEmail ? <p className="truncate text-[10px] text-slate-500">{adminEmail}</p> : null}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 p-4 lg:p-6">
          <header className="mb-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
            <h1 className="mt-0.5 text-2xl font-bold text-white">
              {section === 'announcements' ? 'Announcements' : section === 'service' ? 'Service Control' : 'Final Review'}
            </h1>
          </header>

          {section === 'announcements' ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2 lg:hidden">
                {(['list', 'edit', 'preview'] as AdminTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMobileTab(tab)}
                    className={`rounded-2xl px-3 py-2 text-sm font-semibold capitalize ${
                      mobileTab === tab ? 'bg-amber-400 text-slate-950' : 'bg-white/[0.06] text-slate-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.8fr)_minmax(26rem,1fr)_minmax(22rem,0.9fr)]">
                <div className={mobileTab === 'list' ? 'block' : 'hidden lg:block'}>{listPanel}</div>
                <div className={mobileTab === 'edit' ? 'block' : 'hidden lg:block'}>{editorPanel}</div>
                <div className={mobileTab === 'preview' ? 'block' : 'hidden lg:block'}>{previewPanel}</div>
              </div>
            </>
          ) : section === 'service' ? (
            <div className="max-w-2xl">
              {servicePanel}
            </div>
          ) : (
            <FinalReviewPanel />
          )}
        </section>
      </div>
    </main>
  )
}

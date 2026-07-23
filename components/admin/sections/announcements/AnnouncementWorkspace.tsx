'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, Save, UploadCloud } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AnnouncementPreview } from '@/components/admin/sections/announcements/AnnouncementPreview'
import {
  areAnnouncementFormsEqual,
  createAnnouncementForm,
  isBlogPost,
  normalizeAnnouncementLinks,
  type AdminTab,
  type AnnouncementForm,
  type BlogPost,
  type BlogPostStatus,
} from '@/components/admin/sections/announcements/types'

const MAX_IMAGES = 9

export function AnnouncementWorkspace({
  selectedPost,
  mobileTab,
  onNew,
  onSaved,
}: {
  selectedPost: BlogPost | null
  mobileTab: AdminTab
  onNew: () => void
  onSaved: (post: BlogPost, wasCreated: boolean) => void
}) {
  const baselineForm = useMemo(() => createAnnouncementForm(selectedPost), [selectedPost])
  const [form, setForm] = useState<AnnouncementForm>(baselineForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'warning' | 'error'
    text: string
  } | null>(null)
  const saveRequestIntentRef = useRef(0)
  const uploadRequestIntentRef = useRef(0)
  const objectUrlsRef = useRef(new Set<string>())
  const isDirty = !areAnnouncementFormsEqual(form, baselineForm)
  const canSave = Boolean(form.title.trim()) && isDirty && !saving && !uploading

  useEffect(
    () => () => {
      saveRequestIntentRef.current += 1
      uploadRequestIntentRef.current += 1
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
      objectUrlsRef.current.clear()
    },
    []
  )

  const updateForm = (patch: Partial<AnnouncementForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setFeedback(null)
  }

  const updateLink = (index: number, key: 'label' | 'url', value: string) => {
    setForm((current) => {
      const links = [...current.links]
      links[index] = { ...links[index], [key]: value }
      return { ...current, links }
    })
    setFeedback(null)
  }

  const removeImage = (index: number) => {
    const previewUrl = form.imagePreviewUrls[index]
    if (previewUrl && objectUrlsRef.current.has(previewUrl)) {
      URL.revokeObjectURL(previewUrl)
      objectUrlsRef.current.delete(previewUrl)
    }
    setForm((current) => ({
      ...current,
      imageStoragePaths: current.imageStoragePaths.filter(
        (_, pathIndex) => pathIndex !== index
      ),
      imagePreviewUrls: current.imagePreviewUrls.filter(
        (_, pathIndex) => pathIndex !== index
      ),
    }))
    setFeedback(null)
  }

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length || uploading) return
    const capacity = Math.max(0, MAX_IMAGES - form.imageStoragePaths.length)
    const selectedFiles = Array.from(files).slice(0, capacity)
    if (selectedFiles.length === 0) {
      setFeedback({ tone: 'warning', text: 'This announcement already has 9 images.' })
      return
    }

    const requestIntent = ++uploadRequestIntentRef.current
    const omittedCount = files.length - selectedFiles.length
    setUploading(true)
    setFeedback(null)

    try {
      for (const file of selectedFiles) {
        const response = await fetch('/api/admin/blog-upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        })
        const uploadSpec = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(uploadSpec?.error || 'Failed to create upload URL')
        }

        const { error: uploadError } = await supabase.storage
          .from(uploadSpec.bucket || 'raw-private')
          .uploadToSignedUrl(uploadSpec.storage_path, uploadSpec.token, file)
        if (uploadError) throw new Error('Failed to upload image')
        if (uploadRequestIntentRef.current !== requestIntent) return

        const previewUrl = URL.createObjectURL(file)
        objectUrlsRef.current.add(previewUrl)
        setForm((current) => ({
          ...current,
          imageStoragePaths: [...current.imageStoragePaths, uploadSpec.storage_path].slice(
            0,
            MAX_IMAGES
          ),
          imagePreviewUrls: [...current.imagePreviewUrls, previewUrl].slice(0, MAX_IMAGES),
        }))
      }

      setFeedback({
        tone: omittedCount > 0 ? 'warning' : 'success',
        text:
          omittedCount > 0
            ? `${selectedFiles.length} images uploaded. ${omittedCount} exceeded the 9-image limit.`
            : `${selectedFiles.length} image${selectedFiles.length === 1 ? '' : 's'} uploaded.`,
      })
    } catch (error) {
      if (uploadRequestIntentRef.current !== requestIntent) return
      setFeedback({
        tone: 'error',
        text: `${error instanceof Error ? error.message : 'Failed to upload image'}. Completed uploads were kept in the draft.`,
      })
    } finally {
      if (uploadRequestIntentRef.current === requestIntent) {
        setUploading(false)
      }
    }
  }

  const savePost = async () => {
    if (!canSave) return
    const requestIntent = ++saveRequestIntentRef.current
    const wasCreated = !form.postId
    setSaving(true)
    setFeedback(null)

    try {
      const response = await fetch(
        form.postId ? `/api/admin/blog-posts/${form.postId}` : '/api/admin/blog-posts',
        {
          method: form.postId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: form.title,
            body: form.body,
            status: form.status,
            imageStoragePaths: form.imageStoragePaths,
            links: normalizeAnnouncementLinks(form.links),
          }),
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save announcement')
      }
      if (!isBlogPost(data?.post)) {
        throw new Error('The announcement was saved, but the server response was incomplete')
      }
      if (saveRequestIntentRef.current !== requestIntent) return

      onSaved(data.post, wasCreated)
    } catch (error) {
      if (saveRequestIntentRef.current !== requestIntent) return
      setFeedback({
        tone: 'error',
        text: `${error instanceof Error ? error.message : 'Failed to save announcement'}. Your draft was kept.`,
      })
    } finally {
      if (saveRequestIntentRef.current === requestIntent) {
        setSaving(false)
      }
    }
  }

  return (
    <>
      <div className={mobileTab === 'edit' ? 'block' : 'hidden lg:block'}>
        <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
                Blog / Announcements
              </p>
              <h2 className="mt-1 text-2xl font-bold text-white">
                {form.postId ? 'Edit announcement' : 'Create announcement'}
              </h2>
            </div>
            {form.postId ? (
              <button
                type="button"
                onClick={onNew}
                disabled={saving || uploading}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/16 disabled:cursor-wait disabled:opacity-50"
              >
                New
              </button>
            ) : null}
          </div>

          <fieldset disabled={saving} className="disabled:cursor-wait disabled:opacity-70">
            <label className="block text-sm font-semibold text-slate-200">
              Title
              <input
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
                placeholder="Announcement title"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-slate-200">
              Body
              <textarea
                value={form.body}
                onChange={(event) => updateForm({ body: event.target.value })}
                className="mt-2 min-h-48 w-full rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-amber-300/70"
                placeholder="Write the announcement..."
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block text-sm font-semibold text-slate-200">
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm({ status: event.target.value as BlogPostStatus })
                  }
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/70"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label
                className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-200 transition ${
                  uploading || form.imageStoragePaths.length >= MAX_IMAGES
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:bg-amber-400/16'
                }`}
              >
                <ImagePlus className="h-4 w-4" />
                {uploading ? 'Uploading...' : 'Add images'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploading || form.imageStoragePaths.length >= MAX_IMAGES}
                  className="sr-only"
                  onChange={(event) => {
                    const files = event.currentTarget.files
                    void uploadImages(files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>

            {form.imageStoragePaths.length ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {form.imageStoragePaths.map((path, index) => (
                  <div
                    key={`${path}-${index}`}
                    className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.08]"
                  >
                    {form.imagePreviewUrls[index] ? (
                      <>
                        {/* Signed private URLs and local blobs should bypass image optimization. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={form.imagePreviewUrls[index] ?? undefined}
                          alt={`Uploaded image ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </>
                    ) : (
                      <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-slate-400">
                        Image {index + 1}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      disabled={uploading}
                      className="absolute right-1 top-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-xs text-white shadow hover:bg-red-500 disabled:cursor-wait disabled:opacity-50"
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
                  onClick={() =>
                    updateForm({ links: [...form.links, { label: '', url: '' }] })
                  }
                  className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/16"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add link
                </button>
              </div>
              {form.links.map((link, index) => (
                <div
                  key={`link-${index}`}
                  className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]"
                >
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
                    onClick={() =>
                      updateForm({
                        links: form.links.filter((_, linkIndex) => linkIndex !== index),
                      })
                    }
                    className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-red-500/16 hover:text-red-200"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          {feedback ? (
            <p
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                feedback.tone === 'success'
                  ? 'bg-emerald-500/14 text-emerald-200'
                  : feedback.tone === 'warning'
                    ? 'bg-amber-500/14 text-amber-200'
                    : 'bg-red-500/14 text-red-200'
              }`}
            >
              {feedback.text}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void savePost()}
            disabled={!canSave}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-orange-950/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <UploadCloud className="h-4 w-4 animate-pulse" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving
              ? 'Saving...'
              : form.postId
                ? isDirty
                  ? 'Save changes'
                  : 'No changes'
                : 'Create announcement'}
          </button>
        </section>
      </div>

      <div className={mobileTab === 'preview' ? 'block' : 'hidden lg:block'}>
        <aside className="rounded-[26px] border border-white/10 bg-white/[0.06] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl xl:sticky xl:top-5 xl:max-h-[calc(100vh-2.5rem)] xl:overflow-auto">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">
            Live Preview
          </p>
          <h2 className="mt-1 text-2xl font-bold text-white">Public Blog card</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            This approximates how the announcement will appear on the public Blog page.
          </p>
          <div className="mt-5">
            <AnnouncementPreview form={form} />
          </div>
        </aside>
      </div>
    </>
  )
}

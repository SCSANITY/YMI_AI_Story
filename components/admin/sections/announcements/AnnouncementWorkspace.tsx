'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, Save, UploadCloud, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  AdminButton,
  AdminNotice,
  AdminPanel,
  adminFieldClass,
} from '@/components/admin/AdminUi'
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
      <div
        id="announcement-edit-panel"
        role="tabpanel"
        aria-labelledby="announcement-edit-tab"
        className={mobileTab === 'edit' ? 'block' : 'hidden lg:block'}
      >
        <AdminPanel className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">
                Blog / Announcements
              </p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">
                {form.postId ? 'Edit announcement' : 'Create announcement'}
              </h2>
            </div>
            {form.postId ? (
              <AdminButton
                type="button"
                onClick={onNew}
                disabled={saving || uploading}
                tone="secondary"
                className="min-h-9 px-3 text-xs"
              >
                New
              </AdminButton>
            ) : null}
          </div>

          <fieldset disabled={saving} className="disabled:cursor-wait disabled:opacity-70">
            <label className="block text-sm font-semibold text-[var(--admin-page-ink)]">
              Title
              <input
                value={form.title}
                onChange={(event) => updateForm({ title: event.target.value })}
                className={adminFieldClass}
                placeholder="Announcement title"
              />
            </label>

            <label className="mt-4 block text-sm font-semibold text-[var(--admin-page-ink)]">
              Body
              <textarea
                value={form.body}
                onChange={(event) => updateForm({ body: event.target.value })}
                className={`${adminFieldClass} min-h-48 py-3 leading-6`}
                placeholder="Write the announcement..."
              />
            </label>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block text-sm font-semibold text-[var(--admin-page-ink)]">
                Status
                <select
                  value={form.status}
                  onChange={(event) =>
                    updateForm({ status: event.target.value as BlogPostStatus })
                  }
                  className={adminFieldClass}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="hidden">Hidden</option>
                  <option value="archived">Archived</option>
                </select>
              </label>

              <label
                className={`admin-v2-button admin-v2-button--secondary inline-flex items-center justify-center gap-2 px-4 py-3 text-sm ${
                  uploading || form.imageStoragePaths.length >= MAX_IMAGES
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer'
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
                    className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
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
                      <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-slate-500">
                        Image {index + 1}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      disabled={uploading}
                      className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/70 text-white shadow hover:bg-red-500 disabled:cursor-wait disabled:opacity-50 lg:h-8 lg:w-8"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--admin-page-ink)]">Links</p>
                <AdminButton
                  type="button"
                  onClick={() =>
                    updateForm({ links: [...form.links, { label: '', url: '' }] })
                  }
                  tone="secondary"
                  className="min-h-8 px-3 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add link
                </AdminButton>
              </div>
              {form.links.map((link, index) => (
                <div
                  key={`link-${index}`}
                  className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]"
                >
                  <input
                    value={link.label}
                    onChange={(event) => updateLink(index, 'label', event.target.value)}
                    className={adminFieldClass}
                    placeholder="Label"
                  />
                  <input
                    value={link.url}
                    onChange={(event) => updateLink(index, 'url', event.target.value)}
                    className={adminFieldClass}
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateForm({
                        links: form.links.filter((_, linkIndex) => linkIndex !== index),
                      })
                    }
                    className="admin-v2-button admin-v2-button--danger min-h-10 px-3 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          {feedback ? (
            <AdminNotice
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              tone={
                feedback.tone === 'success'
                  ? 'success'
                  : feedback.tone === 'warning'
                    ? 'warning'
                    : 'danger'
              }
              className="mt-4 text-sm"
            >
              {feedback.text}
            </AdminNotice>
          ) : null}

          <AdminButton
            type="button"
            onClick={() => void savePost()}
            disabled={!canSave}
            tone="primary"
            className="mt-5 w-full"
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
          </AdminButton>
        </AdminPanel>
      </div>

      <div
        id="announcement-preview-panel"
        role="tabpanel"
        aria-labelledby="announcement-preview-tab"
        className={mobileTab === 'preview' ? 'block' : 'hidden lg:block'}
      >
        <aside className="admin-v2-panel p-4 sm:p-5 xl:sticky xl:top-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">
            Live Preview
          </p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--admin-page-ink)]">Public Blog card</h2>
          <div className="mt-4">
            <AnnouncementPreview form={form} />
          </div>
        </aside>
      </div>
    </>
  )
}

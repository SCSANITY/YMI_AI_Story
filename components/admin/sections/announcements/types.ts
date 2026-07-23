export type BlogPostStatus = 'draft' | 'published' | 'hidden' | 'archived'
export type AdminTab = 'list' | 'edit' | 'preview'

export type BlogLink = {
  label: string
  url: string
}

export type BlogPost = {
  post_id: string
  title: string
  body: string
  image_storage_paths: string[]
  image_urls: Array<string | null>
  links: BlogLink[]
  status: BlogPostStatus
  like_count: number
  published_at: string | null
  created_at: string
  updated_at: string
}

export type AnnouncementForm = {
  postId: string | null
  title: string
  body: string
  status: BlogPostStatus
  imageStoragePaths: string[]
  imagePreviewUrls: Array<string | null>
  links: BlogLink[]
}

const BLOG_POST_STATUSES = new Set<BlogPostStatus>([
  'draft',
  'published',
  'hidden',
  'archived',
])

export function createEmptyAnnouncementForm(): AnnouncementForm {
  return {
    postId: null,
    title: '',
    body: '',
    status: 'draft',
    imageStoragePaths: [],
    imagePreviewUrls: [],
    links: [],
  }
}

export function createAnnouncementForm(post: BlogPost | null): AnnouncementForm {
  if (!post) return createEmptyAnnouncementForm()
  return {
    postId: post.post_id,
    title: post.title,
    body: post.body,
    status: post.status,
    imageStoragePaths: [...(post.image_storage_paths ?? [])],
    imagePreviewUrls: [...(post.image_urls ?? [])],
    links: (post.links ?? []).map((link) => ({ ...link })),
  }
}

export function normalizeAnnouncementLinks(links: BlogLink[]) {
  return links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.url)
}

export function areAnnouncementFormsEqual(
  left: AnnouncementForm,
  right: AnnouncementForm
) {
  return (
    left.postId === right.postId &&
    left.title === right.title &&
    left.body === right.body &&
    left.status === right.status &&
    JSON.stringify(left.imageStoragePaths) === JSON.stringify(right.imageStoragePaths) &&
    JSON.stringify(normalizeAnnouncementLinks(left.links)) ===
      JSON.stringify(normalizeAnnouncementLinks(right.links))
  )
}

export function isBlogPost(value: unknown): value is BlogPost {
  if (!value || typeof value !== 'object') return false
  const post = value as Partial<BlogPost>
  return (
    typeof post.post_id === 'string' &&
    typeof post.title === 'string' &&
    typeof post.body === 'string' &&
    typeof post.status === 'string' &&
    BLOG_POST_STATUSES.has(post.status as BlogPostStatus) &&
    Array.isArray(post.image_storage_paths) &&
    Array.isArray(post.image_urls) &&
    Array.isArray(post.links)
  )
}

export type BlogPost = {
  post_id: string
  title: string
  body: string
  image_urls: string[]
  links: Array<{ label: string; url: string }>
  like_count: number
  liked_by_me: boolean
  published_at: string | null
  created_at: string
}

export type LightboxState = {
  images: string[]
  index: number
} | null

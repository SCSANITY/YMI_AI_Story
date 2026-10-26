import { revalidatePath } from 'next/cache'

export function invalidatePublicCatalogCache() {
  revalidatePath('/')
  revalidatePath('/books')
  revalidatePath('/collaboration')
  revalidatePath('/personalize/[bookID]', 'page')
  revalidatePath('/api/templates', 'layout')
  revalidatePath('/sitemap.xml')
}

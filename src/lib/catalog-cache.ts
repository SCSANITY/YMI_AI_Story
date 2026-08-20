import { revalidatePath } from 'next/cache'

export function invalidatePublicCatalogCache() {
  revalidatePath('/')
  revalidatePath('/books')
  revalidatePath('/api/templates')
}

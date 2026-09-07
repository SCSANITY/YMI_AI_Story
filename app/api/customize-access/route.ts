import { getCustomizeAccessSettings } from '@/lib/customize-access-server'
import { noStoreJson } from '@/lib/http-response'

export async function GET() {
  const customizeAccess = await getCustomizeAccessSettings()

  return noStoreJson({ customizeAccess })
}

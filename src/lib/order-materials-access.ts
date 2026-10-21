import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { resolveCheckoutOwner } from '@/lib/checkout-owner'
import { MaterialError, materialUuid } from '@/lib/order-materials'

export type MaterialAccess = { customerId: string; tokenHash: null } | { customerId: null; tokenHash: string }
const TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/
export function hashMaterialToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new MaterialError('material_access_required',401)
  return createHash('sha256').update(token).digest('hex')
}
export function newMaterialCredential() {
  const token=randomBytes(32).toString('base64url')
  return { token,hash:hashMaterialToken(token) }
}
export function materialAccessPath(orderId: string,token: string) {
  materialUuid(orderId);hashMaterialToken(token)
  return `/orders/${orderId}/materials#token=${token}`
}
export async function resolveMaterialAccess(request: Request): Promise<MaterialAccess> {
  // Never read credentials from request URLs; mail-link fragments are submitted
  // by the form via Authorization, not sent to request/access logs.
  const header=request.headers.get('authorization')
  if (header!==null) {
    const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(header)
    if (!match) throw new MaterialError('material_access_required',401)
    return { customerId:null,tokenHash:hashMaterialToken(match[1]) }
  }
  const owner=await resolveCheckoutOwner(request,{allowAnon:false,createAnonIfMissing:false,optional:true})
  if (owner?.ownerType!=='customer') throw new MaterialError('material_access_required',401)
  return { customerId:materialUuid(owner.customerId),tokenHash:null }
}
export async function readMaterialWrite(request: Request) {
  const origin=request.headers.get('origin')
  if (origin && origin!==new URL(request.url).origin) throw new MaterialError('material_origin_denied',403)
  if (request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') {
    throw new MaterialError('invalid_material',400)
  }
  const declared=Number(request.headers.get('content-length') ?? 0)
  if (!Number.isSafeInteger(declared) || declared<0 || declared>4096) throw new MaterialError('invalid_material',400)
  // Bound both declared and streamed size. No token/body content in errors/logs.
  if (!request.body) throw new MaterialError('invalid_material',400)
  const reader=request.body.getReader();let size=0;const chunks: Uint8Array[]=[]
  try {
    for (;;) {
      const next=await reader.read();if (next.done) break
      size+=next.value.byteLength
      if (size>4096) { await reader.cancel();throw new MaterialError('invalid_material',400) }
      chunks.push(next.value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch (error) {
    if (error instanceof MaterialError) throw error
    throw new MaterialError('invalid_material',400)
  } finally { reader.releaseLock() }
}

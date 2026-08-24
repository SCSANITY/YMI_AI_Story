const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export function encodeEmailRouteToken(hexToken: string, expectedHexLength: number): string {
  const normalized = hexToken.trim().toLowerCase()
  if (!new RegExp(`^[a-f0-9]{${expectedHexLength}}$`).test(normalized)) {
    throw new Error('Email route token is invalid')
  }

  let buffer = 0
  let bits = 0
  let encoded = ''

  for (let index = 0; index < normalized.length; index += 2) {
    buffer = (buffer << 8) | Number.parseInt(normalized.slice(index, index + 2), 16)
    bits += 8

    while (bits >= 5) {
      bits -= 5
      encoded += BASE32_ALPHABET[(buffer >> bits) & 31]
    }

    buffer &= bits > 0 ? (1 << bits) - 1 : 0
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(buffer << (5 - bits)) & 31]
  }

  return encoded
}

export function decodeEmailRouteToken(
  encodedToken: string,
  expectedHexLength: number
): string | null {
  const normalized = encodedToken.trim().toLowerCase()
  if (!/^[a-z2-7]+$/.test(normalized)) return null

  let buffer = 0
  let bits = 0
  const bytes: number[] = []

  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character)
    if (value < 0) return null

    buffer = (buffer << 5) | value
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 255)
      buffer &= bits > 0 ? (1 << bits) - 1 : 0
    }
  }

  const decoded = bytes.map((value) => value.toString(16).padStart(2, '0')).join('')
  if (decoded.length !== expectedHexLength) return null

  try {
    return encodeEmailRouteToken(decoded, expectedHexLength) === normalized ? decoded : null
  } catch {
    return null
  }
}

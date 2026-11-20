const name = process.env.NEXT_PUBLIC_SUPABASE_SESSION_COOKIE_NAME
export const sessionCookieOptions = name ? { name } : undefined

export const PASSWORD_RECOVERY_COOKIE = 'ymi_password_recovery'
export const PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS = 10 * 60
export const MIN_CUSTOMER_PASSWORD_LENGTH = 8

export const PASSWORD_RESET_REQUESTED_MESSAGE =
  'If an account exists for this email, a password reset link is on its way. Check your inbox and junk folder.'

export function validateRecoveredPassword(password: string, confirmation: string) {
  if (password.length < MIN_CUSTOMER_PASSWORD_LENGTH) {
    return `Use at least ${MIN_CUSTOMER_PASSWORD_LENGTH} characters.`
  }

  if (password !== confirmation) {
    return 'Passwords do not match.'
  }

  return null
}

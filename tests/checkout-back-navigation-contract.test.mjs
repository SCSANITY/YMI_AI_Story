import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const checkout = await readFile(new URL('../app/checkout/page.tsx', import.meta.url), 'utf8')

test('Checkout applies a Stripe-cancel payment resume only once', () => {
  const resumeEffect = checkout.match(
    /useEffect\(\(\) => \{\s*if \(queryStep !== 'payment'\)[\s\S]*?\n  \}, \[[\s\S]*?user\?\.email,\s*\n  \]\);/
  )?.[0] ?? ''

  assert.match(checkout, /const checkoutPaymentResumeAppliedRef = useRef\(false\)/)
  assert.match(
    resumeEffect,
    /if \(checkoutPaymentResumeAppliedRef\.current\) return;[\s\S]*?checkoutPaymentResumeAppliedRef\.current = true;[\s\S]*?setStep\('payment'\)/
  )
})

test('Checkout Back consumes the payment resume marker before returning to address', () => {
  const backHandler = checkout.match(/const goBackStep = useCallback\([\s\S]*?\n  \}, \[requiresShipping, step\]\);/)?.[0] ?? ''

  assert.match(
    backHandler,
    /removeCheckoutPaymentResumeStep[\s\S]*?checkoutPaymentResumeAppliedRef\.current = true;[\s\S]*?window\.history\.replaceState\(window\.history\.state, '', nextHref\)[\s\S]*?setStep\('address'\)/
  )
})

import * as React from 'react'
import { Hr, Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, EmailDivider, SignoffStamp, emailAsset, emailTheme, emailButtons } from './EmailLayout'
import { BookCoverCard } from './BookCoverCard'
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing'

export type ReceiptItem = {
  name: string
  quantity: number
  unitPrice: number
}

export type ReceiptAddress = {
  firstName?: string
  lastName?: string
  address?: string
  city?: string
  zip?: string
}

type OrderReceiptEmailProps = {
  orderId: string
  displayId?: string | null
  items: ReceiptItem[]
  total: number
  currency?: CheckoutCurrency
  address?: ReceiptAddress
  trackUrl?: string
  /** Real personalized cover image; falls back to the decorative placeholder */
  coverImageUrl?: string
}

// Copy is kept at similar lengths on purpose — the four cards sit in a 2×2
// grid and equal text volume keeps the boxes visually uniform.
const NEXT_STEPS = [
  {
    label: 'Preview',
    text: 'Your complete storybook will arrive in your inbox soon as a beautiful PDF.',
  },
  {
    label: 'Crafting (3–7 Days)',
    text: 'Our team will then begin the official printing and crafting of your book.',
  },
  {
    label: 'Dispatch',
    text: "You will receive a notification with tracking details once it's on its way.",
  },
  {
    label: 'Arrival',
    text: 'Standard shipping takes 7–14 working days (unless Express was selected).',
  },
] as const

function StepCard({ index }: { index: number }) {
  const step = NEXT_STEPS[index]
  return (
    <Section style={styles.stepRow}>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td style={styles.stepNumCell}>
              <div style={styles.stepNum}>{index + 1}.</div>
            </td>
            <td style={styles.stepTextCell}>
              <Text style={styles.stepText}>
                <strong style={styles.stepLabel}>{step.label}:</strong> {step.text}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

export function OrderReceiptEmail({
  orderId,
  displayId,
  items,
  total,
  currency = 'USD',
  address,
  trackUrl,
  coverImageUrl,
}: OrderReceiptEmailProps) {
  const label = displayId || orderId
  return (
    <EmailLayout previewText="Your order is confirmed — a starlight journey begins.">
      <Text style={styles.greeting}>Dear Loving Parent,</Text>

      <Text style={styles.paragraph}>
        Thank you for choosing YMI Story. We are truly touched to help you create this Special
        Gift for your child. Our team is now pouring their hearts into every exquisite
        illustration to ensure a breathtaking surprise that nurtures your child&apos;s Inner Growth.
      </Text>

      {/* Cover card flanked by sparkle accents (hidden on mobile) */}
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td className="ym-hide-sm" style={styles.coverFlankCell}>
              <Img src={emailAsset('sparkles.png')} alt="" width="92" style={styles.coverFlank} />
            </td>
            <td>
              <BookCoverCard coverImageUrl={coverImageUrl} />
            </td>
            <td className="ym-hide-sm" style={styles.coverFlankCell}>
              <Img src={emailAsset('sparkles.png')} alt="" width="92" style={styles.coverFlank} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Order summary */}
      <Section style={styles.summaryWrap}>
        <Text style={styles.summaryEyebrow}>Your Order</Text>
        <Text style={styles.summaryOrderLine}>
          {trackUrl ? (
            <Link href={trackUrl} style={styles.summaryOrderLink}>
              {label}&nbsp;&nbsp;→
            </Link>
          ) : (
            <span style={styles.summaryOrderId}>{label}</span>
          )}
        </Text>

        <Hr style={styles.summaryHr} />

        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
          <tbody>
            {items.map((item, idx) => (
              <tr key={`${item.name}-${idx}`}>
                <td style={styles.itemNameCell}>
                  <Text style={styles.itemName}>{item.name}</Text>
                </td>
                <td style={styles.itemPriceCell}>
                  <Text style={styles.itemPrice}>
                    ×{item.quantity}&nbsp;&nbsp;{formatMajorCurrencyValue(item.unitPrice, currency)}
                  </Text>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <Hr style={styles.summaryHr} />

        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td>
                <Text style={styles.totalLabel}>Total</Text>
              </td>
              <td style={{ textAlign: 'right' }}>
                <Text style={styles.totalValue}>{formatMajorCurrencyValue(total, currency)}</Text>
              </td>
            </tr>
          </tbody>
        </table>

        {address ? (
          <Text style={styles.summaryAddress}>
            <span style={styles.summaryAddressLabel}>Ships to:&nbsp;&nbsp;</span>
            {[
              [address.firstName, address.lastName].filter(Boolean).join(' '),
              address.address,
              [address.city, address.zip].filter(Boolean).join(' '),
            ]
              .filter(Boolean)
              .join(', ')}
          </Text>
        ) : null}
      </Section>

      {/* What happens next — 2×2 grid on desktop, stacked on mobile */}
      <EmailDivider width="40%" mt={6} mb={14} />
      <Text style={styles.sectionTitle}>What Happens Next?</Text>

      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            <td className="ym-col" style={styles.stepColLeft}>
              {[0, 1].map((i) => (
                <StepCard key={i} index={i} />
              ))}
            </td>
            <td className="ym-col" style={styles.stepColRight}>
              {[2, 3].map((i) => (
                <StepCard key={i} index={i} />
              ))}
            </td>
          </tr>
        </tbody>
      </table>

      <Text style={{ ...styles.paragraph, marginTop: '22px' }}>
        We want this journey to be absolutely magical for you and your little one. If you have
        any questions along the way, our team is always here to help.
      </Text>

      <Text style={styles.paragraph}>
        Thank you for letting us turn your love into a lifelong treasure.
      </Text>

      {/* Letter sign-off first (closes the letter), then the action button */}
      <SignoffStamp />

      {trackUrl ? (
        <Section style={styles.ctaWrap}>
          <Link href={trackUrl} style={emailButtons.primary}>
            View Your Order
          </Link>
        </Section>
      ) : null}
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  greeting: {
    margin: '0 0 14px',
    color: emailTheme.ink,
    fontSize: '18px',
    fontWeight: 600,
    fontFamily: emailTheme.serif,
  },
  paragraph: {
    margin: '0 0 16px',
    color: emailTheme.ink,
    fontSize: '14.5px',
    lineHeight: 1.7,
    fontFamily: emailTheme.serif,
  },
  summaryWrap: {
    margin: '0 0 28px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '12px',
    padding: '18px 20px',
    backgroundColor: emailTheme.parchmentShade,
  },
  summaryEyebrow: {
    margin: '0 0 4px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    fontFamily: emailTheme.serif,
  },
  summaryOrderLine: {
    margin: '0 0 4px',
  },
  summaryOrderLink: {
    color: emailTheme.goldDeep,
    fontSize: '17px',
    fontWeight: 700,
    textDecoration: 'underline',
    fontFamily: emailTheme.num,
    letterSpacing: '0.02em',
  },
  summaryOrderId: {
    color: emailTheme.inkDark,
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: emailTheme.num,
    letterSpacing: '0.02em',
  },
  summaryHr: {
    borderColor: emailTheme.frame,
    margin: '12px 0',
  },
  itemNameCell: {
    verticalAlign: 'top',
    paddingRight: '12px',
  },
  itemName: {
    margin: '0 0 6px',
    color: emailTheme.inkDark,
    fontSize: '14.5px',
    fontWeight: 600,
    lineHeight: 1.5,
    fontFamily: emailTheme.serif,
  },
  itemPriceCell: {
    verticalAlign: 'top',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  itemPrice: {
    margin: '0 0 6px',
    color: emailTheme.ink,
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: emailTheme.num,
  },
  totalLabel: {
    margin: 0,
    color: emailTheme.inkDark,
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: emailTheme.serif,
    letterSpacing: '0.04em',
  },
  totalValue: {
    margin: 0,
    color: emailTheme.inkDark,
    fontSize: '17px',
    fontWeight: 700,
    fontFamily: emailTheme.num,
  },
  summaryAddress: {
    margin: '12px 0 0',
    color: emailTheme.inkSoft,
    fontSize: '12.5px',
    lineHeight: 1.55,
    fontFamily: emailTheme.serif,
  },
  summaryAddressLabel: {
    fontWeight: 700,
    color: '#7a5c33',
  },
  coverFlankCell: {
    textAlign: 'center',
    verticalAlign: 'middle',
    width: '18%',
  },
  coverFlank: {
    margin: '0 auto',
    display: 'inline-block',
    opacity: 0.85,
  },
  sectionTitle: {
    margin: '0 0 16px',
    color: emailTheme.heading,
    fontSize: '21px',
    fontWeight: 600,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  stepColLeft: {
    width: '50%',
    verticalAlign: 'top',
    paddingRight: '7px',
  },
  stepColRight: {
    width: '50%',
    verticalAlign: 'top',
    paddingLeft: '7px',
  },
  stepRow: {
    margin: '0 0 12px',
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '12px',
    padding: '13px 15px',
    backgroundColor: emailTheme.parchmentShade,
  },
  stepNumCell: {
    width: '42px',
    verticalAlign: 'top',
  },
  stepNum: {
    width: '30px',
    height: '30px',
    lineHeight: '30px',
    borderRadius: '50%',
    border: '1px solid #ea9015',
    backgroundColor: emailTheme.amber, // Outlook fallback
    backgroundImage: 'linear-gradient(135deg, #f6b03b 0%, #f97f2b 100%)',
    color: '#fffdf6',
    fontSize: '13px',
    fontWeight: 700,
    textAlign: 'center',
    fontFamily: emailTheme.num,
    boxShadow: '0 4px 10px -4px rgba(251, 146, 60, 0.55)',
  },
  stepTextCell: {
    verticalAlign: 'top',
  },
  stepText: {
    margin: 0,
    color: emailTheme.ink,
    fontSize: '13.5px',
    lineHeight: 1.6,
    fontFamily: emailTheme.serif,
  },
  stepLabel: {
    color: emailTheme.accentWarm,
    fontWeight: 700,
  },
  ctaWrap: {
    margin: '4px 0 0',
    textAlign: 'center',
  },
}

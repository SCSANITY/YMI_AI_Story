import * as React from 'react'
import { Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailAsset, emailTheme, emailButtons } from './EmailLayout'

export type AbandonmentItem = {
  name: string
  quantity: number
  /** Personalized cover preview; falls back to the decorative placeholder */
  coverImageUrl?: string
}

type AbandonmentEmailProps = {
  resumeUrl: string
  items: AbandonmentItem[]
  displayId?: string | null
  orderId?: string
}

const MAX_COVERS = 8

/**
 * Book cover gallery: 1 book → large centered cover; 2-3 → static centered
 * row (safe in every client); 4+ → horizontal scroll strip (scrolls in
 * Apple Mail/iOS; Gmail strips overflow and shows a clipped row, acceptable).
 */
function CoverGallery({ items }: { items: AbandonmentItem[] }) {
  if (items.length === 0) return null
  const size = items.length === 1 ? 210 : 150
  const shown = items.slice(0, MAX_COVERS)
  const scroll = items.length > 3
  return (
    <Section style={scroll ? styles.galleryScroll : styles.galleryRow}>
      {shown.map((item, idx) => (
        <div key={`${item.name}-${idx}`} style={{ ...styles.tile, width: `${size}px` }}>
          <div style={{ ...styles.tileFrame, width: `${size}px`, height: `${size}px` }}>
            <Img
              src={item.coverImageUrl || emailAsset('cover-placeholder.png')}
              alt={item.name}
              width={size}
              height={size}
              style={item.coverImageUrl ? styles.tileImage : styles.tilePlaceholder}
            />
          </div>
          <Text style={styles.tileName}>{item.name}</Text>
        </div>
      ))}
    </Section>
  )
}

export function AbandonmentEmail({ resumeUrl, items, displayId, orderId }: AbandonmentEmailProps) {
  const label = displayId || orderId
  return (
    <EmailLayout
      previewText="Your checkout is still waiting"
      title="Still Interested in Your Story? ✦"
      subtitle="You left checkout before payment. Your selected books are still reserved and ready."
    >
      {label ? (
        <Text style={styles.orderLine}>
          Order&nbsp;&nbsp;
          <Link href={resumeUrl} style={styles.orderLink}>
            {label}&nbsp;→
          </Link>
        </Text>
      ) : null}

      <CoverGallery items={items} />

      <Section style={styles.listWrap}>
        <Text style={styles.listTitle}>Waiting in Your Cart</Text>
        {items.length === 0 ? (
          <Text style={styles.itemText}>Your selected items are ready to checkout.</Text>
        ) : (
          items.map((item, idx) => (
            <Text key={`${item.name}-${idx}`} style={styles.itemText}>
              ✦&nbsp;&nbsp;{item.name}&nbsp;&nbsp;
              <span style={styles.itemQty}>×{item.quantity}</span>
            </Text>
          ))
        )}
      </Section>

      <Section style={styles.ctaWrap}>
        <Link href={resumeUrl} style={emailButtons.primary}>
          Resume Checkout
        </Link>
      </Section>
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  orderLine: {
    margin: '0 0 16px',
    color: emailTheme.ink,
    fontSize: '14px',
    textAlign: 'center',
    fontFamily: emailTheme.serif,
    fontWeight: 600,
  },
  orderLink: {
    color: emailTheme.goldDeep,
    fontSize: '15px',
    fontWeight: 700,
    textDecoration: 'underline',
    fontFamily: emailTheme.num,
    letterSpacing: '0.02em',
  },
  galleryRow: {
    margin: '0 0 22px',
    textAlign: 'center',
  },
  galleryScroll: {
    margin: '0 0 22px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: '6px',
  },
  tile: {
    display: 'inline-block',
    verticalAlign: 'top',
    whiteSpace: 'normal',
    margin: '0 8px 6px',
  },
  tileFrame: {
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '12px',
    backgroundColor: emailTheme.parchmentShade,
    overflow: 'hidden',
    boxShadow: '0 8px 20px -10px rgba(154, 110, 44, 0.4)',
  },
  tileImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    borderRadius: '11px',
  },
  tilePlaceholder: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    padding: '8px',
  },
  tileName: {
    margin: '8px 0 0',
    color: emailTheme.ink,
    fontSize: '12.5px',
    lineHeight: 1.45,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
    fontWeight: 600,
  },
  listWrap: {
    margin: '0 0 22px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '12px',
    padding: '16px 18px',
    backgroundColor: emailTheme.parchmentShade,
  },
  listTitle: {
    margin: '0 0 10px',
    color: emailTheme.inkSoft,
    fontSize: '12px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    fontFamily: emailTheme.serif,
  },
  itemText: {
    margin: '0 0 6px',
    color: emailTheme.inkDark,
    fontSize: '14px',
    lineHeight: 1.55,
    fontWeight: 600,
    fontFamily: emailTheme.serif,
  },
  itemQty: {
    color: emailTheme.ink,
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: emailTheme.num,
  },
  ctaWrap: {
    margin: '0 0 8px',
    textAlign: 'center',
  },
}

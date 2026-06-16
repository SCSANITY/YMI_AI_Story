import * as React from 'react'
import { Img, Section, Text } from '@react-email/components'
import { emailAsset, emailTheme } from './EmailLayout'

/**
 * Square book-cover display card shared across email templates.
 * Renders the personalized (face-swapped) cover when a URL is provided,
 * otherwise an ornamental placeholder. Square per brand spec.
 */

type BookCoverCardProps = {
  coverImageUrl?: string
  title?: string
  caption?: string
}

const COVER_SIZE = 232

export function BookCoverCard({
  coverImageUrl,
  title = 'Personalized Book Cover',
  caption = 'Your child’s story is being crafted\nwith love and imagination.',
}: BookCoverCardProps) {
  const captionLines = caption.split('\n')
  return (
    <Section style={styles.outer}>
      <Section style={styles.inner}>
        {coverImageUrl ? (
          <Section style={styles.square}>
            <Img
              src={coverImageUrl}
              alt="Your personalized book cover"
              width={COVER_SIZE}
              height={COVER_SIZE}
              style={styles.image}
            />
          </Section>
        ) : (
          <Img
            src={emailAsset('cover-placeholder.png')}
            alt="Your book cover will appear here"
            width={COVER_SIZE}
            style={styles.placeholderImage}
          />
        )}
        {coverImageUrl ? <Text style={styles.title}>{title}</Text> : null}
        <Text style={styles.caption}>
          {captionLines.map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 ? <br /> : null}
              {line}
            </React.Fragment>
          ))}
        </Text>
      </Section>
    </Section>
  )
}

const styles: Record<string, React.CSSProperties> = {
  outer: {
    margin: '26px auto',
    width: '300px',
    maxWidth: '300px',
    border: `1px solid ${emailTheme.frame}`,
    borderRadius: '14px',
    padding: '7px',
    backgroundColor: emailTheme.parchmentShade,
    boxShadow: '0 12px 28px -14px rgba(106, 77, 38, 0.45)',
  },
  inner: {
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '9px',
    padding: '20px 16px 18px',
    backgroundColor: emailTheme.parchment,
    textAlign: 'center',
  },
  square: {
    margin: '0 auto 16px',
    width: `${COVER_SIZE}px`,
    height: `${COVER_SIZE}px`,
    borderRadius: '8px',
    border: `1px solid ${emailTheme.frameSoft}`,
    backgroundColor: emailTheme.parchmentShade,
    overflow: 'hidden',
    textAlign: 'center',
  },
  image: {
    width: `${COVER_SIZE}px`,
    height: `${COVER_SIZE}px`,
    objectFit: 'cover',
    display: 'block',
    borderRadius: '8px',
  },
  placeholderImage: {
    margin: '0 auto 12px',
    display: 'block',
  },
  title: {
    margin: '0 0 7px',
    color: '#6b4a23',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '1.8px',
    textTransform: 'uppercase',
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  caption: {
    margin: 0,
    color: emailTheme.inkSoft,
    fontSize: '13px',
    lineHeight: 1.6,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
    fontStyle: 'italic',
  },
}

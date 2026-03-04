import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'

type EmailLayoutProps = {
  previewText: string
  title: string
  subtitle?: string
  children: React.ReactNode
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '#'
const TOP_BANNER =
  'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=240&q=80'
const BOTTOM_BANNER =
  'https://images.unsplash.com/photo-1472806426350-603610d85659?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=240&q=80'

export function EmailLayout({ previewText, title, subtitle, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Section style={styles.outerWrap}>
          <Container style={styles.bannerContainer}>
            <a href={SITE_URL} style={styles.link} target="_blank" rel="noreferrer">
              <Img src={TOP_BANNER} alt="Ymi Story Sunset" style={styles.bannerImage} />
            </a>
          </Container>

          <Container style={styles.container}>
            <Section style={styles.accentBar} />

            <Section style={styles.content}>
              <Section style={styles.pillWrap}>
                <Text style={styles.brandPill}>YMI STORY</Text>
              </Section>

              <Heading style={styles.title}>{title}</Heading>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              {children}
            </Section>

            <Section style={styles.footerContainer}>
              <Hr style={styles.hr} />
              <Text style={styles.footerText}>(c) 2026 Ymi Story Inc. All rights reserved.</Text>
            </Section>
          </Container>

          <Container style={styles.bannerContainer}>
            <a href={SITE_URL} style={styles.link} target="_blank" rel="noreferrer">
              <Img src={BOTTOM_BANNER} alt="Ymi Story Campaign" style={styles.bannerImage} />
            </a>
          </Container>
        </Section>
      </Body>
    </Html>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#ff6a5a',
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  outerWrap: {
    width: '100%',
    padding: '40px 16px',
    backgroundColor: '#ff6a5a',
    backgroundImage: 'linear-gradient(135deg, #1c2e4a 0%, #ff6a5a 55%, #ffb347 100%)',
  },
  bannerContainer: {
    maxWidth: '600px',
    margin: '0 auto 24px auto',
  },
  link: {
    textDecoration: 'none',
  },
  bannerImage: {
    width: '100%',
    maxWidth: '600px',
    height: '120px',
    objectFit: 'cover',
    borderRadius: '12px',
    boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.15)',
  },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    overflow: 'hidden',
    boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.18), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
  },
  accentBar: {
    height: '4px',
    backgroundColor: '#ff6a5a',
    backgroundImage: 'linear-gradient(135deg, #1c2e4a 0%, #ff6a5a 55%, #ffb347 100%)',
  },
  content: {
    padding: '56px 48px',
  },
  pillWrap: {
    marginBottom: '22px',
    textAlign: 'center',
  },
  brandPill: {
    margin: 0,
    display: 'inline-block',
    padding: '8px 14px',
    borderRadius: '999px',
    background: '#f5f5f7',
    color: '#5b5b61',
    fontWeight: 600,
    fontSize: '12px',
    letterSpacing: '2.4px',
    textTransform: 'uppercase',
  },
  title: {
    margin: '0 0 12px 0',
    color: '#1d1d1f',
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.6px',
    lineHeight: 1.15,
    textAlign: 'center',
    fontFamily: "'Baloo 2', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  subtitle: {
    margin: '0 0 28px 0',
    color: '#515154',
    fontSize: '16px',
    lineHeight: 1.65,
    textAlign: 'center',
  },
  footerContainer: {
    padding: '0 48px 40px 48px',
    backgroundColor: '#ffffff',
  },
  hr: {
    borderColor: '#f5f5f7',
    margin: '0 0 32px 0',
  },
  footerText: {
    margin: 0,
    color: '#a1a1aa',
    fontSize: '13px',
    lineHeight: 1.4,
    textAlign: 'center',
  },
}


import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

/**
 * Brand shell shared by all YMI Story emails — "storybook magic" language:
 * warm parchment texture, illustrated banner, code-drawn gold ornaments,
 * bright amber-gradient CTAs (mirrors the site's Hero CTA), and a hand-stamped
 * team seal at the end of every letter.
 *
 * Typography rule: serif (Cormorant → Georgia fallback) for prose;
 * sans (Inter/Arial) for ALL digits — Georgia's old-style figures vary in
 * height and make numbers look uneven.
 *
 * Implementation rules:
 * - Ornaments that CAN be code are code (dividers, sparkle rows) — crisper,
 *   zero bytes, recolorable. Only real artwork ships as images.
 * - The seal's tilt is baked into the PNG (Gmail strips CSS transform).
 * - Outlook ignores media queries / gradients / background-image and falls
 *   back to: desktop layout, solid amber buttons, plain parchment bg.
 */

const SITE = 'https://www.ymistory.com'

/**
 * Social links — UI shells for now. Fill in the real profile URLs here once
 * the accounts are live; every email footer updates automatically.
 * Icons are code-generated from SVG by scripts/prepare-email-assets.mjs.
 */
export const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://www.instagram.com/ymi.story/', icon: 'icon-instagram.png' },
  { label: 'Facebook', href: 'https://www.facebook.com/profile.php?id=61587283844755', icon: 'icon-facebook.png' },
  // No TikTok account yet — points to TikTok home until one exists.
  { label: 'TikTok', href: 'https://www.tiktok.com', icon: 'icon-tiktok.png' },
] as const

/** Resolve an email asset URL. Reads env at call time so previews can override. */
export function emailAsset(file: string): string {
  const base = process.env.EMAIL_ASSET_BASE || `${SITE}/email-assets`
  return `${base}/${file}`
}

export const emailTheme = {
  serif: "'Cormorant Garamond', 'Playfair Display', Georgia, 'Times New Roman', serif",
  sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  /** use for every numeric string (prices, IDs, tracking, codes) */
  num: "Inter, 'Segoe UI', Roboto, Arial, sans-serif",
  // Palette matched to the site's bright amber/orange brand (amber-500/orange-500)
  inkDark: '#4a3826',
  ink: '#5d4a33',
  inkSoft: '#8a7253',
  heading: '#9a5b10',
  accentWarm: '#c05621',
  gold: '#d97706',
  goldDeep: '#d97706',
  goldPale: '#f0c987',
  amber: '#f59e0b',
  orange: '#f97316',
  parchment: '#fffdf6',
  parchmentShade: '#fbf4e4',
  frame: '#ecc987',
  frameSoft: '#f3deba',
} as const

/** Shared CTA styles — every button in every email looks identical. */
export const emailButtons: Record<'primary' | 'secondary', React.CSSProperties> = {
  primary: {
    display: 'inline-block',
    padding: '13px 32px',
    borderRadius: '999px',
    backgroundColor: '#f59e0b', // Outlook fallback
    // Exact site Hero CTA gradient: amber-500 → orange-500
    backgroundImage: 'linear-gradient(95deg, #f59e0b 0%, #f97316 100%)',
    color: '#fffdf6',
    fontSize: '14.5px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textDecoration: 'none',
    fontFamily: emailTheme.serif,
    boxShadow: '0 10px 28px -10px rgba(249, 115, 22, 0.6)',
  },
  secondary: {
    display: 'inline-block',
    padding: '11px 26px',
    borderRadius: '999px',
    backgroundColor: emailTheme.parchment,
    border: '1px solid #f3b95e',
    color: '#ea7c1c',
    fontSize: '13.5px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textDecoration: 'none',
    fontFamily: emailTheme.serif,
  },
}

/**
 * Code-drawn ornament divider: 1px fading hairlines with calligraphic curls
 * around a gold star. The hairline is a 1px <div> INSIDE the cell — putting
 * a background on an empty <td> paints the full row height (thick-bar bug).
 */
export function EmailDivider({ width = '58%', mt = 0, mb = 0 }: { width?: string; mt?: number; mb?: number }) {
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      align="center"
      style={{ width, marginTop: `${mt}px`, marginBottom: `${mb}px`, marginLeft: 'auto', marginRight: 'auto' }}
    >
      <tbody>
        <tr>
          <td style={dividerStyles.lineCell}>
            <div style={dividerStyles.lineLeft} />
          </td>
          <td style={dividerStyles.star}>
            <span style={dividerStyles.curl}>⊰</span>&nbsp;✦&nbsp;<span style={dividerStyles.curl}>⊱</span>
          </td>
          <td style={dividerStyles.lineCell}>
            <div style={dividerStyles.lineRight} />
          </td>
        </tr>
      </tbody>
    </table>
  )
}

const dividerStyles: Record<string, React.CSSProperties> = {
  lineCell: {
    verticalAlign: 'middle',
  },
  lineLeft: {
    height: '1px',
    fontSize: '1px',
    lineHeight: '1px',
    backgroundColor: emailTheme.goldPale, // Outlook fallback: solid hairline
    backgroundImage: `linear-gradient(to right, rgba(217, 119, 6, 0), rgba(217, 119, 6, 0.65))`,
  },
  lineRight: {
    height: '1px',
    fontSize: '1px',
    lineHeight: '1px',
    backgroundColor: emailTheme.goldPale,
    backgroundImage: `linear-gradient(to left, rgba(217, 119, 6, 0), rgba(217, 119, 6, 0.65))`,
  },
  star: {
    width: '78px',
    textAlign: 'center',
    color: emailTheme.gold,
    fontSize: '13px',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  curl: {
    fontSize: '12px',
    color: emailTheme.goldPale,
  },
}

/**
 * Hand-stamped signature block: a left-aligned "YMI STORY TEAM" sign-off with
 * the tilted seal stamped on the RIGHT, overlapping only the tail of the text
 * (background-position right). Gmail/Apple Mail render the stamp; Outlook
 * ignores background-image and shows a clean text-only sign-off.
 */
export function SignoffStamp() {
  return (
    <Section style={signoffStyles.wrap}>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ width: '100%' }}>
        <tbody>
          <tr>
            {/* Left: signature, standard English-letter format */}
            <td style={signoffStyles.textCell}>
              <Text style={signoffStyles.line}>With warmth and starlight,</Text>
              <Text style={signoffStyles.team}>YMI&nbsp;STORY&nbsp;TEAM</Text>
            </td>
            {/* Right: team seal, level with the signature */}
            <td style={signoffStyles.sealCell}>
              <Img
                src={emailAsset('seal.png')}
                alt="The YMI Story Team seal"
                width="140"
                style={signoffStyles.sealImg}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  )
}

const signoffStyles: Record<string, React.CSSProperties> = {
  wrap: {
    padding: '18px 4px 14px',
  },
  textCell: {
    textAlign: 'left',
    verticalAlign: 'middle',
  },
  sealCell: {
    textAlign: 'right',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
  },
  line: {
    margin: '0 0 4px',
    color: emailTheme.ink,
    fontSize: '14px',
    fontStyle: 'italic',
    fontFamily: emailTheme.serif,
  },
  team: {
    margin: 0,
    color: emailTheme.heading,
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '2px',
    fontFamily: emailTheme.serif,
  },
  sealImg: {
    display: 'inline-block',
  },
}

type EmailLayoutProps = {
  previewText: string
  /** In-body heading. Omit when the subject line alone carries the message. */
  title?: string
  subtitle?: string
  /** Header illustration. Defaults to the brand banner; pass null to hide. */
  bannerUrl?: string | null
  children: React.ReactNode
}

export function EmailLayout({ previewText, title, subtitle, bannerUrl, children }: EmailLayoutProps) {
  const banner = bannerUrl === null ? null : bannerUrl || emailAsset('banner.png')
  // Computed at render time so the preview script's EMAIL_ASSET_BASE override applies.
  const innerFrameStyle: React.CSSProperties = {
    ...styles.innerFrame,
    backgroundImage: `url(${emailAsset('texture.jpg')})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
  }
  return (
    <Html>
      <Head>
        {/* Gmail/Apple Mail honor these; Outlook desktop ignores media queries and
            simply renders the desktop layout, which is acceptable. */}
        <style>{`
          @media only screen and (max-width: 640px) {
            .ym-content { padding-left: 22px !important; padding-right: 22px !important; }
            .ym-footer { padding-left: 22px !important; padding-right: 22px !important; }
            .ym-logo { width: 108px !important; }
            .ym-title { font-size: 23px !important; }
            .ym-col { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
            .ym-hide-sm { display: none !important; }
          }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={styles.body}>
        <Section style={styles.outerWrap}>
          <Container style={styles.container}>
            {/* Padding wrapper (NOT margin — margin on a 100%-width table pushes the
                right border outside the clipping container and it disappears) */}
            <Section style={styles.framePad}>
              <Section style={innerFrameStyle}>
                {banner ? <Img src={banner} alt="A Memory to Keep — YMI Story" style={styles.banner} /> : null}

                <Section style={styles.content} className="ym-content">
                  <Img src={emailAsset('logo-full.png')} alt="YMI Story" width="132" className="ym-logo" style={styles.logo} />
                  <EmailDivider width="46%" />

                  {title ? (
                    <Heading style={styles.title} className="ym-title">{title}</Heading>
                  ) : (
                    <Section style={styles.noTitleSpacer} />
                  )}
                  {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

                  {children}
                </Section>

                <Section style={styles.footerContainer} className="ym-footer">
                  <EmailDivider width="70%" />

                  {/* Symmetric centered stack: social icons → Contact Us → copyright */}
                  <Section style={styles.socialRow}>
                    {SOCIAL_LINKS.map((s) => (
                      <Link key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={styles.socialLink}>
                        <Img src={emailAsset(s.icon)} alt={s.label} width="32" height="32" style={styles.socialIcon} />
                      </Link>
                    ))}
                  </Section>

                  <Text style={styles.contactLine}>
                    <Link href={`${SITE}/support`} style={styles.footerLink}>Contact&nbsp;Us</Link>
                  </Text>

                  <Text style={styles.footerText}>
                    ✦&nbsp;&nbsp;©&nbsp;<span style={styles.footerNum}>2026</span>&nbsp;YMI Story. All rights
                    reserved.&nbsp;&nbsp;✦
                  </Text>
                </Section>
              </Section>
            </Section>
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
    backgroundColor: '#f1e6d2',
    fontFamily: emailTheme.sans,
  },
  outerWrap: {
    width: '100%',
    padding: '36px 14px',
    backgroundColor: '#f1e6d2',
  },
  container: {
    // Landscape desktop format per brand mockup; shrinks fluidly on small screens.
    maxWidth: '920px',
    margin: '0 auto',
    backgroundColor: emailTheme.parchment,
    borderRadius: '20px',
    border: `2px solid ${emailTheme.frame}`,
    overflow: 'hidden',
    boxShadow: '0 18px 40px -16px rgba(106, 77, 38, 0.28)',
  },
  framePad: {
    padding: '10px',
  },
  innerFrame: {
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '13px',
    overflow: 'hidden',
    backgroundColor: emailTheme.parchment,
  },
  banner: {
    width: '100%',
    height: 'auto',
    display: 'block',
  },
  content: {
    padding: '22px 56px 8px',
  },
  logo: {
    margin: '0 auto 16px',
    display: 'block',
  },
  title: {
    margin: '20px 0 10px',
    color: emailTheme.heading,
    fontSize: '27px',
    fontWeight: 600,
    lineHeight: 1.35,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  subtitle: {
    margin: '0 0 22px',
    color: emailTheme.ink,
    fontSize: '15px',
    lineHeight: 1.65,
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  noTitleSpacer: {
    height: '22px',
    fontSize: '1px',
    lineHeight: '1px',
  },
  footerContainer: {
    padding: '0 56px 26px',
  },
  socialRow: {
    marginTop: '16px',
    marginBottom: '4px',
    textAlign: 'center',
  },
  socialLink: {
    display: 'inline-block',
    margin: '0 9px',
  },
  socialIcon: {
    display: 'inline-block',
    verticalAlign: 'middle',
  },
  contactLine: {
    margin: '8px 0 12px',
    textAlign: 'center',
    fontSize: '13.5px',
    fontFamily: emailTheme.serif,
  },
  footerLink: {
    color: emailTheme.heading,
    textDecoration: 'none',
    fontWeight: 600,
  },
  footerDot: {
    color: emailTheme.gold,
  },
  footerText: {
    margin: 0,
    color: emailTheme.heading,
    fontSize: '12px',
    textAlign: 'center',
    fontFamily: emailTheme.serif,
  },
  footerNum: {
    fontFamily: "Inter, 'Segoe UI', Roboto, Arial, sans-serif",
    fontSize: '11px',
  },
}

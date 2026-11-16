import * as React from 'react'
import { Img, Link, Section, Text } from '@react-email/components'
import { EmailLayout, emailAsset, emailTheme, emailButtons } from './EmailLayout'
import type { ReminderStage } from '@/lib/unpaid-reminders'

type AbandonmentItem = {
  name: string
  quantity: number
  childName?: string
  coverImageUrl?: string
}

type AbandonmentEmailProps = {
  resumeUrl: string
  items: readonly AbandonmentItem[]
  stage: ReminderStage
  firstName?: string | null
}

const MAX_COVERS = 8

function normalizeName(name?: string | null) {
  return name?.trim().replace(/\s+/g, ' ') || null
}

export function buildAbandonmentEmailCopy(
  stage: ReminderStage,
  items: readonly AbandonmentItem[],
  firstName?: string | null
) {
  const candidate = normalizeName(items[0]?.childName)
  const child = candidate && items.every((item) => normalizeName(item.childName) === candidate)
    ? candidate
    : null
  const multipleBooks = items.length > 1 || (items[0]?.quantity ?? 0) > 1
  const greeting = `Hi ${normalizeName(firstName) ?? 'there'},`

  switch (stage) {
    case 1:
      return {
        subject: child ? `A little adventure is waiting for ${child}` : 'A little adventure is waiting',
        title: 'A little adventure is waiting',
        preheader: 'A personalised hardcover, ready for your first reading together.',
        greeting,
        paragraphs: [
          `A little adventure with ${child ?? 'your child'} at its heart is still in your basket.`,
          'Imagine opening the book together. They spot their name, recognise themselves in the illustrations, and look up at you with a delighted “That’s me!”',
          multipleBooks
            ? 'You’ve chosen the stories. Now let’s turn them into personalised hardcover keepsakes, ready for your first reading together.'
            : 'You’ve chosen the story. Now let’s turn it into a personalised hardcover keepsake, ready for your first reading together.',
        ],
        cta: 'Bring Their Story to Life',
        help: 'If there’s anything you’d like to know before placing your order, simply reply to this email. We’d be delighted to help you make this gift feel just right.',
      }
    case 2:
      return {
        subject: child ? `Where will ${child}’s story take you?` : 'Where will the story take you?',
        title: 'Where will the story take you?',
        preheader: 'One adventure can start a dozen little conversations.',
        greeting,
        paragraphs: [
          'The first surprise is seeing themselves on the page. The next is imagining what they could do.',
          `As ${child ?? 'your child'} steps into the adventure, a story can become an invitation to ask questions, explore a brave choice, or notice a small act of kindness.`,
          'Read together, pause at a favourite illustration, and ask, “What would you do?” Those little conversations are where inner growth can begin.',
          multipleBooks
            ? 'The books you chose are still in your basket. Make them theirs, and see where the stories take you together.'
            : `${child ? `${child}’s book` : 'Your chosen book'} is still in your basket. Make it theirs, and see where the story takes you both.`,
        ],
        cta: 'Complete My Order',
      }
    case 3:
      return {
        subject: child ? `A story ${child} can call their own` : 'A story to call their own',
        title: 'A story to call their own',
        preheader: 'A keepsake for this little chapter of childhood.',
        greeting,
        paragraphs: [
          `Of all the books on the shelf, imagine ${child ?? 'your child'} reaching for the one with their name on it.`,
          'Perhaps it becomes the story you share before lights out, the book packed for a weekend away, or a favourite they proudly show someone they love.',
          'With each reading, it can gather memories of this chapter of childhood, and the moments you made time to share.',
          multipleBooks
            ? 'The books you chose are still in your basket. Complete your order, and give them stories to call their own.'
            : `Your chosen book is still in your basket. Complete your order, and give ${child ?? 'your child'} a story to call their own.`,
        ],
        cta: 'Make Their Story a Reality',
        help: `If you have any questions before bringing ${child ? `${child}’s story` : 'their story'} to life, we’d be delighted to help. Simply reply to this email.`,
      }
  }
}

function BookCard({ item, compact }: { item: AbandonmentItem; compact: boolean }) {
  return (
    <Section style={styles.card}>
      <Img
        src={item.coverImageUrl || emailAsset('cover-placeholder.png')}
        alt=""
        width={compact ? 96 : 154}
        style={styles.cover}
      />
      <Text style={styles.bookTitle}>{item.name}</Text>
      <Text style={styles.bookType}>
        Personalised Hardcover{item.quantity > 1 ? ` · ${item.quantity} copies` : ''}
      </Text>
    </Section>
  )
}

export function AbandonmentEmail({ resumeUrl, items, stage, firstName }: AbandonmentEmailProps) {
  const copy = buildAbandonmentEmailCopy(stage, items, firstName)
  const remainingBooks = items.length - MAX_COVERS
  return (
    <EmailLayout previewText={copy.preheader} title={copy.title}>
      <Section style={styles.letter}>
        <Text style={styles.body}>{copy.greeting}</Text>
        {copy.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}

        {items.slice(0, MAX_COVERS).map((item, index) => (
          <BookCard key={`${item.name}-${index}`} item={item} compact={items.length > 1} />
        ))}
        {remainingBooks > 0 && (
          <Text style={styles.remaining}>And {remainingBooks} more {remainingBooks === 1 ? 'title' : 'titles'} in your basket.</Text>
        )}

        <Section style={styles.cta}>
          <Link href={resumeUrl} style={{ ...emailButtons.primary, padding: '13px 21px', letterSpacing: '0.025em' }}>
            {copy.cta}
          </Link>
        </Section>

        {copy.help && <Text style={styles.body}>{copy.help}</Text>}

        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <td>
                <Text style={styles.signoff}>With warmth,<br /><strong>The YMI Story Team</strong></Text>
              </td>
              <td align="right">
                <Img src={emailAsset('seal.png')} alt="" width={100} style={styles.seal} />
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </EmailLayout>
  )
}

const styles: Record<string, React.CSSProperties> = {
  letter: { maxWidth: '560px', margin: '0 auto' },
  body: {
    margin: '0 0 14px',
    color: emailTheme.inkDark,
    fontFamily: emailTheme.serif,
    fontSize: '16px',
    lineHeight: 1.65,
  },
  card: {
    maxWidth: '312px',
    margin: '0 auto 10px',
    border: `1px solid ${emailTheme.frameSoft}`,
    borderRadius: '14px',
    backgroundColor: emailTheme.parchmentShade,
    padding: '18px 22px',
    textAlign: 'center',
  },
  cover: { maxWidth: '100%', height: 'auto', margin: '0 auto', borderRadius: '9px', border: `1px solid ${emailTheme.frameSoft}` },
  bookTitle: { margin: '9px 0 2px', color: emailTheme.inkDark, fontSize: '16px', fontWeight: 700, fontFamily: emailTheme.serif, lineHeight: 1.4 },
  bookType: { margin: '0', color: emailTheme.ink, fontSize: '11px', fontFamily: emailTheme.sans, lineHeight: 1.4 },
  remaining: { margin: '0 0 10px', color: emailTheme.ink, textAlign: 'center', fontSize: '13px', fontFamily: emailTheme.serif },
  cta: { textAlign: 'center', margin: '17px 0 18px' },
  signoff: { margin: '0', color: emailTheme.inkDark, fontFamily: emailTheme.serif, fontSize: '16px', lineHeight: 1.55 },
  seal: { maxWidth: '100%', height: 'auto', marginLeft: 'auto' },
}

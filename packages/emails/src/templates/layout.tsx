import {
  Body,
  Button,
  Column,
  Container,
  Font,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

// "The doorway": a lintel is the beam over a door. Each email is one: a deep beam across the top
// carrying the name, a white opening framed by fine jambs, and a threshold slab underneath.
// Colours follow the app (primary oklch(0.5 0.17 258)), in hex for email clients.
export const colors = {
  page: '#eef1f5',
  beam: '#11254b',
  beamText: '#ffffff',
  beamMuted: '#9fb6dc',
  primary: '#145ec1',
  primaryText: '#ffffff',
  text: '#0c1015',
  body: '#2b323b',
  muted: '#636a72',
  jamb: '#d5dbe3',
  threshold: '#c9d1dc',
  panel: '#f4f7fb',
  critical: '#c23434',
}

const fontFamily = 'Geist, "Helvetica Neue", Helvetica, Arial, sans-serif'

export type Tone = 'primary' | 'critical'

export function EmailLayout({
  preview,
  footer = "You're getting this because someone used Lintel to contact you. If you weren't expecting it, you can ignore this email.",
  children,
}: {
  preview: string
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <Font
          fontFamily="Geist"
          fallbackFontFamily={['Helvetica', 'Arial', 'sans-serif']}
          webFont={{
            url: 'https://fonts.gstatic.com/s/geist/v5/gyByhwUxId8gMEwcGFWNOITd.woff2',
            format: 'woff2',
          }}
          fontWeight="400 700"
          fontStyle="normal"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.page, margin: 0, padding: '32px 12px', fontFamily }}>
        <Container style={{ maxWidth: 520, width: '100%' }}>
          {/* The lintel. */}
          <Section
            style={{
              backgroundColor: colors.beam,
              borderRadius: '10px 10px 0 0',
              padding: '18px 28px',
            }}
          >
            <Row>
              <Column>
                <Text
                  style={{
                    color: colors.beamText,
                    fontFamily,
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: '0.32em',
                    lineHeight: '20px',
                    margin: 0,
                    textTransform: 'uppercase',
                  }}
                >
                  Lintel
                </Text>
              </Column>
              <Column align="right">
                <Text
                  style={{
                    color: colors.beamMuted,
                    fontFamily,
                    fontSize: 12,
                    lineHeight: '20px',
                    margin: 0,
                  }}
                >
                  Run your home together
                </Text>
              </Column>
            </Row>
          </Section>
          {/* The beam's lit edge. */}
          <Section style={{ backgroundColor: colors.primary, height: 3, lineHeight: '3px' }}>
            &nbsp;
          </Section>
          {/* The opening, between its jambs. */}
          <Section
            style={{
              backgroundColor: '#ffffff',
              borderLeft: `1px solid ${colors.jamb}`,
              borderRight: `1px solid ${colors.jamb}`,
              padding: '36px 32px 32px',
            }}
          >
            {children}
          </Section>
          {/* The threshold. */}
          <Section
            style={{
              backgroundColor: colors.threshold,
              borderRadius: '0 0 6px 6px',
              height: 8,
              lineHeight: '8px',
            }}
          >
            &nbsp;
          </Section>
          <Text
            style={{
              color: colors.muted,
              fontFamily,
              fontSize: 12,
              lineHeight: '18px',
              margin: '20px 4px 0',
            }}
          >
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

/** The small label over the heading, e.g. "Invitation" or "Overdue". */
export function Eyebrow({ children, tone = 'primary' }: { children: ReactNode; tone?: Tone }) {
  const color = tone === 'critical' ? colors.critical : colors.primary
  return (
    <Text
      style={{
        color,
        fontFamily,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.14em',
        lineHeight: '16px',
        margin: '0 0 12px',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          backgroundColor: color,
          display: 'inline-block',
          height: 8,
          marginRight: 8,
          verticalAlign: 'middle',
          width: 8,
        }}
      />
      {children}
    </Text>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Heading
      as="h1"
      style={{
        color: colors.text,
        fontFamily,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: '32px',
        margin: '0 0 14px',
      }}
    >
      {children}
    </Heading>
  )
}

export function Paragraph({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: colors.body,
        fontFamily,
        fontSize: 15,
        lineHeight: '24px',
        margin: '0 0 16px',
      }}
    >
      {children}
    </Text>
  )
}

/** Key facts in a tinted panel: a label over each value. */
export function Details({
  rows,
  tone = 'primary',
}: {
  rows: { label: string; value: ReactNode }[]
  tone?: Tone
}) {
  return (
    <Section
      style={{
        backgroundColor: colors.panel,
        borderLeft: `3px solid ${tone === 'critical' ? colors.critical : colors.primary}`,
        borderRadius: '0 6px 6px 0',
        margin: '8px 0 24px',
        padding: '14px 18px 2px',
      }}
    >
      {rows.map((row) => (
        <Text key={row.label} style={{ fontFamily, margin: '0 0 12px' }}>
          <span
            style={{
              color: colors.muted,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              lineHeight: '16px',
              textTransform: 'uppercase',
            }}
          >
            {row.label}
          </span>
          {/* A line break rather than block spans, so the plain-text part reads "Label\nvalue". */}
          <br />
          <span style={{ color: colors.text, fontSize: 15, lineHeight: '22px' }}>{row.value}</span>
        </Text>
      ))}
    </Section>
  )
}

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: colors.primary,
        borderRadius: 8,
        color: colors.primaryText,
        fontFamily,
        fontSize: 15,
        fontWeight: 600,
        lineHeight: '20px',
        padding: '13px 22px',
      }}
    >
      {children}&nbsp;&nbsp;&rarr;
    </Button>
  )
}

/** The link spelled out, for when the button doesn't work. */
export function LinkFallback({ href }: { href: string }) {
  return (
    <Text
      style={{
        color: colors.muted,
        fontFamily,
        fontSize: 13,
        lineHeight: '20px',
        margin: '24px 0 0',
      }}
    >
      Button not working? Paste this into your browser:
      <br />
      <Link href={href} style={{ color: colors.primary, wordBreak: 'break-all' }}>
        {href}
      </Link>
    </Text>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        color: colors.muted,
        fontFamily,
        fontSize: 13,
        lineHeight: '20px',
        margin: '16px 0 0',
      }}
    >
      {children}
    </Text>
  )
}

import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

export const colors = {
  text: '#1c1917',
  muted: '#78716c',
  border: '#e7e5e4',
  primary: '#1c1917',
  primaryText: '#fafaf9',
}

export function EmailLayout({
  preview,
  footer = "You received this because someone used Home to contact you. If you weren't expecting it, you can ignore this email.",
  children,
}: {
  preview: string
  footer?: string
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#fafaf9',
          color: colors.text,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          margin: 0,
          padding: '24px 12px',
        }}
      >
        <Container
          style={{
            backgroundColor: '#ffffff',
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            maxWidth: 480,
            padding: '32px 28px',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: 600, margin: '0 0 24px' }}>🏠 Home</Text>
          <Section>{children}</Section>
          <Hr style={{ borderColor: colors.border, margin: '28px 0 16px' }} />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: '18px', margin: 0 }}>
            {footer}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

import { Button, Heading, Text } from '@react-email/components'
import { colors, EmailLayout } from './layout.tsx'

export interface InviteEmailProps {
  inviterName: string
  householdName: string
  inviteUrl: string
  email: string
  expiresOn: string
}

export const inviteSubject = ({ inviterName, householdName }: InviteEmailProps) =>
  `${inviterName} invited you to ${householdName} on Home`

export function InviteEmail({
  inviterName,
  householdName,
  inviteUrl,
  email,
  expiresOn,
}: InviteEmailProps) {
  return (
    <EmailLayout preview={`${inviterName} invited you to help manage ${householdName}`}>
      <Heading as="h1" style={{ fontSize: 22, lineHeight: '30px', margin: '0 0 12px' }}>
        Join {householdName}
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: '24px', margin: '0 0 24px' }}>
        {inviterName} has invited you to help manage {householdName}: shared expenses and receipts,
        recurring household tasks and your trusted service providers.
      </Text>
      <Button
        href={inviteUrl}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 8,
          color: colors.primaryText,
          fontSize: 15,
          fontWeight: 600,
          padding: '12px 20px',
        }}
      >
        Accept invite
      </Button>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: '20px', margin: '24px 0 0' }}>
        Sign in with {email} to accept. This invite expires on {expiresOn}.
      </Text>
    </EmailLayout>
  )
}

/** Sample values for previews and tests. */
export const inviteSample: InviteEmailProps = {
  inviterName: 'Ada Obi',
  householdName: 'Lekki flat',
  inviteUrl: 'http://localhost:5173/invite/sample-token',
  email: 'bola@example.com',
  expiresOn: '1 October 2026',
}

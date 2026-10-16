import {
  Details,
  EmailLayout,
  Eyebrow,
  LinkFallback,
  Note,
  Paragraph,
  PrimaryButton,
  Title,
} from './layout.tsx'

export interface InviteEmailProps {
  inviterName: string
  householdName: string
  inviteUrl: string
  email: string
  expiresOn: string
}

export const inviteSubject = ({ inviterName, householdName }: InviteEmailProps) =>
  `${inviterName} invited you to ${householdName} on Lintel`

export function InviteEmail({
  inviterName,
  householdName,
  inviteUrl,
  email,
  expiresOn,
}: InviteEmailProps) {
  return (
    <EmailLayout preview={`${inviterName} invited you to help run ${householdName}`}>
      <Eyebrow>Invitation</Eyebrow>
      <Title>Join {householdName}</Title>
      <Paragraph>
        {inviterName} has invited you to help run {householdName} on Lintel: shared expenses and
        receipts, the shopping list and pantry, recurring jobs around the house and the people you
        trust to do them.
      </Paragraph>
      <Details
        rows={[
          { label: 'Household', value: householdName },
          { label: 'Invited by', value: inviterName },
          { label: 'Expires', value: expiresOn },
        ]}
      />
      <PrimaryButton href={inviteUrl}>Accept invite</PrimaryButton>
      <Note>
        Sign in or create an account with {email} to accept. The invite works once, for that
        address.
      </Note>
      <LinkFallback href={inviteUrl} />
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

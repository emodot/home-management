// Supabase Auth's own emails (sign-up, password reset, email change, sign-in link), in Lintel's
// design. Rendered to supabase/templates/*.html; Supabase fills in the {{ .Placeholders }}.
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

const CONFIRMATION_URL = '{{ .ConfirmationURL }}'
const EMAIL = '{{ .Email }}'
const NEW_EMAIL = '{{ .NewEmail }}'

const authFooter = (
  <>
    You&apos;re getting this because someone used {EMAIL} on Lintel. If it wasn&apos;t you, you can
    ignore this email and nothing will change.
  </>
)

export function ConfirmSignupEmail() {
  return (
    <EmailLayout preview="Confirm your email to finish setting up Lintel" footer={authFooter}>
      <Eyebrow>Welcome</Eyebrow>
      <Title>Confirm your email</Title>
      <Paragraph>
        You&apos;re nearly in. Confirm {EMAIL} and you&apos;ll go straight on to your household.
      </Paragraph>
      <PrimaryButton href={CONFIRMATION_URL}>Confirm email</PrimaryButton>
      <Note>The link expires in an hour.</Note>
      <LinkFallback href={CONFIRMATION_URL} />
    </EmailLayout>
  )
}

export function ResetPasswordEmail() {
  return (
    <EmailLayout preview="Choose a new password for Lintel" footer={authFooter}>
      <Eyebrow>Password reset</Eyebrow>
      <Title>Choose a new password</Title>
      <Paragraph>
        Someone asked to reset the password for {EMAIL}. If that was you, choose a new one below.
      </Paragraph>
      <PrimaryButton href={CONFIRMATION_URL}>Reset password</PrimaryButton>
      <Note>
        The link works once and expires in an hour. Your current password works until then.
      </Note>
      <LinkFallback href={CONFIRMATION_URL} />
    </EmailLayout>
  )
}

export function ChangeEmailEmail() {
  return (
    <EmailLayout preview="Confirm your new email address for Lintel" footer={authFooter}>
      <Eyebrow>Email change</Eyebrow>
      <Title>Confirm your new email</Title>
      <Paragraph>Confirm this change to the email address you sign in to Lintel with.</Paragraph>
      <Details
        rows={[
          { label: 'From', value: EMAIL },
          { label: 'To', value: NEW_EMAIL },
        ]}
      />
      <PrimaryButton href={CONFIRMATION_URL}>Confirm change</PrimaryButton>
      <Note>Until it&apos;s confirmed, you keep signing in with {EMAIL}.</Note>
      <LinkFallback href={CONFIRMATION_URL} />
    </EmailLayout>
  )
}

export function MagicLinkEmail() {
  return (
    <EmailLayout preview="Your link to sign in to Lintel" footer={authFooter}>
      <Eyebrow>Sign in</Eyebrow>
      <Title>Your sign-in link</Title>
      <Paragraph>Use this link to sign in to Lintel as {EMAIL}.</Paragraph>
      <PrimaryButton href={CONFIRMATION_URL}>Sign in</PrimaryButton>
      <Note>The link works once and expires in an hour.</Note>
      <LinkFallback href={CONFIRMATION_URL} />
    </EmailLayout>
  )
}

/** Each Supabase template: its file under supabase/templates/ and subject line. */
export const AUTH_TEMPLATES = [
  { name: 'confirmation', subject: 'Confirm your email for Lintel', element: ConfirmSignupEmail },
  { name: 'recovery', subject: 'Reset your Lintel password', element: ResetPasswordEmail },
  { name: 'email_change', subject: 'Confirm your new email for Lintel', element: ChangeEmailEmail },
  { name: 'magic_link', subject: 'Your Lintel sign-in link', element: MagicLinkEmail },
] as const

import type { RenderedEmail } from '../../../packages/emails/generated/index.ts'

export type SendEmail = (to: string, email: RenderedEmail) => Promise<void>

/**
 * Sends through Resend. Without RESEND_API_KEY and with a local APP_URL, emails are written to the
 * function log instead so invites can be tested locally.
 */
export function createEmailSender(options: {
  apiKey: string | undefined
  from: string | undefined
  allowLogOnly: boolean
}): SendEmail {
  const { apiKey, from, allowLogOnly } = options

  if (!apiKey || !from) {
    if (!allowLogOnly) throw new Error('RESEND_API_KEY and EMAIL_FROM must be set')
    return (to, email) => {
      console.log(
        `[email not sent: no RESEND_API_KEY] To: ${to}\nSubject: ${email.subject}\n\n${email.text}`,
      )
      return Promise.resolve()
    }
  }

  return async (to, email) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}: ${await response.text()}`)
    }
  }
}

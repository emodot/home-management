import { describe, expect, it } from 'vitest'
import { renderInviteEmail } from '../generated/index.ts'
import { inviteSample } from './templates/invite.tsx'

describe('renderInviteEmail', () => {
  it('fills every value into subject, HTML and text', () => {
    const email = renderInviteEmail(inviteSample)
    expect(email.subject).toBe('Ada Obi invited you to Lekki flat on Home')
    expect(email.html).toContain('href="http://localhost:5173/invite/sample-token"')
    expect(email.html).toContain('Join <!-- -->Lekki flat')
    expect(email.text).toContain('http://localhost:5173/invite/sample-token')
    expect(email.text).toContain('bola@example.com')
    expect(email.html).not.toMatch(/%%\d+%%/)
    expect(email.text).not.toMatch(/%%\d+%%/)
  })

  it('escapes HTML in values but not in the plain-text part', () => {
    const email = renderInviteEmail({ ...inviteSample, householdName: '<b>Tom & "Jerry"</b>' })
    expect(email.html).toContain('&lt;b&gt;Tom &amp; &quot;Jerry&quot;&lt;/b&gt;')
    expect(email.html).not.toContain('<b>Tom')
    expect(email.text).toContain('<b>Tom & "Jerry"</b>')
  })

  it('keeps the subject on one line', () => {
    expect(renderInviteEmail({ ...inviteSample, inviterName: 'Ada\r\nBcc: x' }).subject).toBe(
      'Ada Bcc: x invited you to Lekki flat on Home',
    )
  })
})

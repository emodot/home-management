import { describe, expect, it } from 'vitest'
import { renderInviteEmail, renderTaskReminderEmail } from '../generated/index.ts'
import { inviteSample } from './templates/invite.tsx'
import { taskReminderSample } from './templates/task-reminder.tsx'

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

describe('renderTaskReminderEmail', () => {
  it('renders upcoming reminders with the provider when there is one', () => {
    const email = renderTaskReminderEmail('upcomingWithProvider', taskReminderSample)
    expect(email.subject).toBe('Reminder: Service the generator is due tomorrow')
    expect(email.text).toContain('This is due tomorrow (26 September 2026) in Lekki flat.')
    expect(email.text).toContain('Provider: Emeka Gen Services · +234 805 123 4567')
    expect(email.html).toContain('href="http://localhost:5173/tasks/sample"')
  })

  it('leaves the provider out of the plain variants', () => {
    const email = renderTaskReminderEmail('overdue', taskReminderSample)
    expect(email.subject).toBe('Overdue: Service the generator was due 26 September 2026')
    expect(email.text).toContain("hasn't been marked done yet")
    expect(email.text).not.toContain('Provider:')
    expect(email.html).not.toMatch(/%%\d+%%/)
  })
})

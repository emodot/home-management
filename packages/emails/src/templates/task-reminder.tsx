import { Button, Heading, Text } from '@react-email/components'
import { colors, EmailLayout } from './layout.tsx'

export interface TaskReminderEmailProps {
  recipientName: string
  taskTitle: string
  householdName: string
  /** "1 October 2026" */
  dueDate: string
  /** "today", "tomorrow", "on 3 October" */
  dueText: string
  taskUrl: string
  /** "Emeka Gen Services · +234 805 123 4567" (only rendered by the withProvider variants) */
  providerLine: string
  /** "It's assigned to you." or "You're getting this as a member of Obi home." */
  reason: string
}

export type TaskReminderVariant =
  'upcoming' | 'upcomingWithProvider' | 'overdue' | 'overdueWithProvider'

export const taskReminderSubject = (variant: TaskReminderVariant, p: TaskReminderEmailProps) =>
  variant.startsWith('overdue')
    ? `Overdue: ${p.taskTitle} was due ${p.dueDate}`
    : `Reminder: ${p.taskTitle} is due ${p.dueText}`

export function TaskReminderEmail({
  variant,
  ...p
}: TaskReminderEmailProps & { variant: TaskReminderVariant }) {
  const overdue = variant.startsWith('overdue')
  const withProvider = variant.endsWith('WithProvider')
  return (
    <EmailLayout
      preview={
        overdue ? `${p.taskTitle} was due ${p.dueDate}` : `${p.taskTitle} is due ${p.dueText}`
      }
      footer="Task reminders from Home, for households you belong to."
    >
      <Text style={{ fontSize: 15, margin: '0 0 8px' }}>Hi {p.recipientName},</Text>
      <Heading as="h1" style={{ fontSize: 22, lineHeight: '30px', margin: '0 0 12px' }}>
        {p.taskTitle}
      </Heading>
      <Text style={{ fontSize: 15, lineHeight: '24px', margin: '0 0 8px' }}>
        {overdue
          ? `This was due on ${p.dueDate} in ${p.householdName} and hasn't been marked done yet.`
          : `This is due ${p.dueText} (${p.dueDate}) in ${p.householdName}.`}
      </Text>
      {withProvider && (
        <Text style={{ fontSize: 15, lineHeight: '24px', margin: '0 0 8px' }}>
          Provider: {p.providerLine}
        </Text>
      )}
      <Button
        href={p.taskUrl}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 8,
          color: colors.primaryText,
          fontSize: 15,
          fontWeight: 600,
          marginTop: 16,
          padding: '12px 20px',
        }}
      >
        {overdue ? 'Open task' : 'View task'}
      </Button>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: '20px', margin: '24px 0 0' }}>
        {p.reason} When it&apos;s done, mark it done in the app and you&apos;ll stop getting
        reminders for it.
      </Text>
    </EmailLayout>
  )
}

export const taskReminderSample: TaskReminderEmailProps = {
  recipientName: 'Ada Obi',
  taskTitle: 'Service the generator',
  householdName: 'Lekki flat',
  dueDate: '26 September 2026',
  dueText: 'tomorrow',
  taskUrl: 'http://localhost:5173/tasks/sample',
  providerLine: 'Emeka Gen Services · +234 805 123 4567',
  reason: "You're getting this as a member of Lekki flat.",
}

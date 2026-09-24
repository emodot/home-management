import { telUrl, whatsappUrl, type Provider } from '@home/shared'
import { MailIcon, MessageCircleIcon, PhoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Tap-to-call, tap-to-WhatsApp and email for a provider (only the ones they have). */
export function ContactButtons({
  provider,
  size = 'sm',
  iconOnly = false,
}: {
  provider: Pick<Provider, 'name' | 'phone' | 'whatsapp' | 'email'>
  size?: 'sm' | 'default'
  iconOnly?: boolean
}) {
  const whatsapp = provider.whatsapp ?? provider.phone
  const iconSize = iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size
  return (
    <div className="flex flex-wrap gap-2">
      {provider.phone && (
        <Button variant="outline" size={iconSize} asChild>
          <a href={telUrl(provider.phone)} aria-label={`Call ${provider.name}`}>
            <PhoneIcon aria-hidden />
            {!iconOnly && 'Call'}
          </a>
        </Button>
      )}
      {whatsapp && (
        <Button variant="outline" size={iconSize} asChild>
          <a
            href={whatsappUrl(whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${provider.name}`}
          >
            <MessageCircleIcon aria-hidden />
            {!iconOnly && 'WhatsApp'}
          </a>
        </Button>
      )}
      {provider.email && !iconOnly && (
        <Button variant="outline" size={iconSize} asChild>
          <a href={`mailto:${provider.email}`} aria-label={`Email ${provider.name}`}>
            <MailIcon aria-hidden />
            Email
          </a>
        </Button>
      )}
    </div>
  )
}

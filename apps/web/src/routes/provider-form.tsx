import { formatPhone } from '@home/shared'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ProviderForm } from '@/components/provider-fields'
import { EMPTY_PROVIDER } from '@/lib/providers'
import { useActiveHousehold } from '@/hooks/use-household'
import { useCreateProvider, useProviderLookup, useUpdateProvider } from '@/hooks/use-providers'
import { errorMessage } from '@/lib/errors'

export function NewProviderPage() {
  const household = useActiveHousehold()
  const create = useCreateProvider(household.id)
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add provider</h1>
      <ProviderForm
        defaultValues={EMPTY_PROVIDER}
        submitLabel="Add provider"
        onCancel={() => void navigate(-1)}
        onSubmit={async (values) => {
          try {
            const provider = await create.mutateAsync(values)
            toast.success(`Added ${provider.name}`)
            await navigate(`/providers/${provider.id}`, { replace: true })
          } catch (error) {
            toast.error(`Couldn't add the provider. ${errorMessage(error)}`)
          }
        }}
      />
    </div>
  )
}

export function EditProviderPage() {
  const { providerId = '' } = useParams()
  const household = useActiveHousehold()
  const provider = useProviderLookup(household.id).get(providerId)
  const update = useUpdateProvider(household.id, providerId)
  const navigate = useNavigate()
  if (!provider) throw new Response('Not found', { status: 404, statusText: 'Not found' })

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit {provider.name}</h1>
      <ProviderForm
        defaultValues={{
          name: provider.name,
          trade: provider.trade,
          phone: provider.phone ? formatPhone(provider.phone) : '',
          whatsapp: provider.whatsapp ? formatPhone(provider.whatsapp) : '',
          email: provider.email ?? '',
          area: provider.area ?? '',
          notes: provider.notes ?? '',
          rating: provider.rating,
        }}
        submitLabel="Save changes"
        onCancel={() => void navigate(-1)}
        onSubmit={async (values) => {
          try {
            await update.mutateAsync(values)
            toast.success('Provider updated')
            await navigate(`/providers/${provider.id}`, { replace: true })
          } catch (error) {
            toast.error(`Couldn't save. ${errorMessage(error)}`)
          }
        }}
      />
    </div>
  )
}

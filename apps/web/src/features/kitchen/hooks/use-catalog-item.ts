import { useSuspenseQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { useActiveHousehold } from '@/hooks/use-household'
import { kitchenItemQuery } from '../lib/queries'

/** The catalogue item named in the URL (:itemId). Its loader has already 404'd missing ones. */
export function useCatalogItem() {
  const household = useActiveHousehold()
  const itemId = useParams().itemId ?? ''
  const item = useSuspenseQuery(kitchenItemQuery(household.id, itemId)).data
  return { itemId, item }
}

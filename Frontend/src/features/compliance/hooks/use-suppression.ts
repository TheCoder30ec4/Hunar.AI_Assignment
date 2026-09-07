import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from '@/shared/api/query-keys'

import {
  addSuppression,
  getSuppressionList,
  removeSuppression,
  type AddSuppressionInput,
} from '../api/suppression'

export function useSuppressionList() {
  return useQuery({
    queryKey: qk.suppression.all,
    queryFn: ({ signal }) => getSuppressionList(signal),
  })
}

export function useAddSuppression() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: AddSuppressionInput) => addSuppression(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.suppression.all }),
  })
}

export function useRemoveSuppression() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entryId: string) => removeSuppression(entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.suppression.all }),
  })
}

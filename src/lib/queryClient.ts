import { QueryClient } from '@tanstack/react-query'

export const createQueryClient = (retry: number | boolean = 1) =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry } },
  })

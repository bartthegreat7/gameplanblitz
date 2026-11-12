import { useQuery } from '@tanstack/react-query'

import { getNews, NewsNotPublished } from '../lib/news'

/** The published news file. A missing file (not generated yet) is reported, not retried. */
export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: getNews,
    staleTime: 5 * 60_000,
    retry: (count, err) => !(err instanceof NewsNotPublished) && count < 1,
  })
}

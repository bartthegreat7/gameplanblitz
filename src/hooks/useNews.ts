import { useQuery } from '@tanstack/react-query'

import { getNews, newsConfigured, type NewsQuery } from '../lib/news'

export function useNews(query: NewsQuery = { limit: 60 }) {
  return useQuery({
    queryKey: ['news', query],
    queryFn: () => getNews(query),
    enabled: newsConfigured,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

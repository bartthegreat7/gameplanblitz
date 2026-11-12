import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'

// Pages are lazy-loaded; under a full parallel run their first render can take over the default 1s.
configure({ asyncUtilTimeout: 10_000 })

import { render, screen } from '@testing-library/react'

import App from './App'

describe('App shell', () => {
  it('renders the dashboard route and primary navigation', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThan(0)
  })
})

import { Moon, Sun } from 'lucide-react'

import { useAppStore } from '../../store/app'

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme)
  const toggle = useAppStore((s) => s.toggleTheme)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      className="grid size-11 place-items-center rounded-full border border-line bg-card text-ink-2 transition-colors hover:text-ink"
    >
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  )
}

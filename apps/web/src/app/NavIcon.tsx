export type NavIconName =
  | 'home'
  | 'calendar'
  | 'planner'
  | 'customers'
  | 'reports'
  | 'settings'
  | 'more'
  | 'plus'
  | 'ai'
  | 'visit'
  | 'bell'
  | 'theme'

interface NavIconProps {
  name: NavIconName
  className?: string
}

export function NavIcon({ name, className = 'h-5 w-5' }: NavIconProps) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3.5 10.5 12 3.75l8.5 6.75" />
          <path d="M5.75 9.25v10.5h12.5V9.25" />
          <path d="M9.5 19.75v-6h5v6" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
          <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17" />
          <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
        </svg>
      )
    case 'planner':
      return (
        <svg {...common}>
          <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
          <path d="M8 8h8M8 12h5M8 16h3" />
          <path d="m15.5 15.5 1.2 1.2 2.3-2.7" />
        </svg>
      )
    case 'customers':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.75 19c.45-3.2 2.15-5 5.25-5s4.8 1.8 5.25 5" />
          <path d="M15.5 5.5a3 3 0 0 1 0 5.5M16 14c2.35.2 3.7 1.85 4.1 4.5" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...common}>
          <path d="M5 20V10M12 20V4M19 20v-7" />
          <path d="M3 20.5h18" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 13.5v-3l-2-.65a7.7 7.7 0 0 0-.7-1.7l.95-1.9-2.1-2.1-1.9.95a7.7 7.7 0 0 0-1.7-.7L10.9 2h-3l-.65 2.4a7.7 7.7 0 0 0-1.7.7l-1.9-.95-2.1 2.1.95 1.9a7.7 7.7 0 0 0-.7 1.7L.5 10.5v3l2.3.65c.18.6.42 1.17.7 1.7l-.95 1.9 2.1 2.1 1.9-.95c.53.28 1.1.52 1.7.7L8.9 22h3l.65-2.4c.6-.18 1.17-.42 1.7-.7l1.9.95 2.1-2.1-.95-1.9c.28-.53.52-1.1.7-1.7L19 13.5Z" transform="translate(2 -2) scale(.83)" />
        </svg>
      )
    case 'ai':
      return (
        <svg {...common}>
          <path d="m12 3 1.15 3.35L16.5 7.5l-3.35 1.15L12 12l-1.15-3.35L7.5 7.5l3.35-1.15L12 3Z" />
          <path d="m18.2 12.8.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75.75-2.05Z" />
          <path d="m5.4 13.4.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" />
        </svg>
      )
    case 'visit':
      return (
        <svg {...common}>
          <path d="M5 5.5h14v13H5z" />
          <path d="M8 3.5v4M16 3.5v4M5 9h14" />
          <path d="m9 14 1.7 1.7L15 11.5" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...common}>
          <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 6-2.5 7.5h17C20.5 15 18 15 18 9Z" />
          <path d="M9.5 20h5" />
        </svg>
      )
    case 'theme':
      return (
        <svg {...common}>
          <path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )
  }
}

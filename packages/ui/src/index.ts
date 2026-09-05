export const fieldRepDesignTokens = {
  direction: 'rtl',
  minTouchTarget: '44px',
  radiusCard: '22px',
  radiusControl: '14px',
  radiusPanel: '26px',
  radiusPill: '999px',
  contentMaxWidth: '1480px',
  sidebarWidth: '288px',
  mobileBottomNavHeight: '72px',
} as const

export {
  DEFAULT_FIELD_TIME_ZONE,
  PERSIAN_CALENDAR_LOCALE,
  formatJalaliLongDate,
  formatJalaliMonthTitle,
  formatPersianWeekday,
  getJalaliDateParts,
  type JalaliDateParts,
  type JalaliFormatOptions,
} from './jalali'

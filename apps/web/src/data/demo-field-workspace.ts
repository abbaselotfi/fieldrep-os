export type DemoCustomerKind = 'doctor' | 'pharmacy' | 'clinic'
export type DemoCustomerClass = 'A' | 'B' | 'C'
export type DemoPlanStatus = 'completed' | 'next' | 'planned'
export type DemoCalendarEventType = 'visit' | 'meeting' | 'leave' | 'trip' | 'company_closure'

export interface DemoCustomer {
  id: string
  kind: DemoCustomerKind
  name: string
  specialty: string
  className: DemoCustomerClass
  route: string
  frequencyCompleted: number
  frequencyTarget: number
  locations: readonly {
    label: string
    area: string
    address: string
  }[]
}

export interface DemoPlanEntry {
  customerId: string
  time: string
  status: DemoPlanStatus
}

export interface DemoWeekDay {
  day: number
  weekday: string
  route: string
  target: number
  customerIds: readonly string[]
}

export interface DemoCalendarEvent {
  day: number
  time: string
  type: DemoCalendarEventType
  title: string
  detail: string
}

export const demoWorkspace = {
  company: 'شرکت نمونه',
  workspace: 'تیم دیابت',
  territory: 'مشهد',
  user: 'کاربر نمایشی',
  cycle: 'سیکل تابستان ۱۴۰۵',
} as const

export const demoCustomers: readonly DemoCustomer[] = [
  {
    id: 'doctor-arman-rezaei',
    kind: 'doctor',
    name: 'دکتر آرمان رضایی',
    specialty: 'داخلی',
    className: 'A',
    route: 'Route 8',
    frequencyCompleted: 4,
    frequencyTarget: 6,
    locations: [
      { label: 'مطب اصلی', area: 'احمدآباد', address: 'مشهد، احمدآباد، محدوده محتشمی' },
      { label: 'کلینیک عصر', area: 'سجاد', address: 'مشهد، سجاد، محدوده بهارستان' },
    ],
  },
  {
    id: 'doctor-nazanin-karimi',
    kind: 'doctor',
    name: 'دکتر نازنین کریمی',
    specialty: 'غدد و متابولیسم',
    className: 'A',
    route: 'Route 8',
    frequencyCompleted: 5,
    frequencyTarget: 6,
    locations: [{ label: 'کلینیک', area: 'سجاد', address: 'مشهد، بلوار سجاد، محدوده حامد' }],
  },
  {
    id: 'doctor-mehdi-sharifi',
    kind: 'doctor',
    name: 'دکتر مهدی شریفی',
    specialty: 'پزشک عمومی',
    className: 'B',
    route: 'Route 8',
    frequencyCompleted: 3,
    frequencyTarget: 4,
    locations: [{ label: 'مطب', area: 'کوهسنگی', address: 'مشهد، کوهسنگی، محدوده حکیم نظامی' }],
  },
  {
    id: 'doctor-sara-zamani',
    kind: 'doctor',
    name: 'دکتر سارا زمانی',
    specialty: 'نفرولوژی',
    className: 'A',
    route: 'Route 7',
    frequencyCompleted: 3,
    frequencyTarget: 6,
    locations: [{ label: 'مطب', area: 'سناباد', address: 'مشهد، سناباد، محدوده دانشگاه' }],
  },
  {
    id: 'doctor-pouya-naderi',
    kind: 'doctor',
    name: 'دکتر پویا نادری',
    specialty: 'داخلی',
    className: 'B',
    route: 'Route 7',
    frequencyCompleted: 2,
    frequencyTarget: 4,
    locations: [{ label: 'مطب', area: 'دانشجو', address: 'مشهد، بلوار دانشجو، محدوده فرهنگ' }],
  },
  {
    id: 'pharmacy-sepid',
    kind: 'pharmacy',
    name: 'داروخانه سپید',
    specialty: 'داروخانه',
    className: 'B',
    route: 'Route 8',
    frequencyCompleted: 2,
    frequencyTarget: 4,
    locations: [{ label: 'شعبه اصلی', area: 'احمدآباد', address: 'مشهد، احمدآباد، محدوده رضا' }],
  },
  {
    id: 'doctor-elham-tavakoli',
    kind: 'doctor',
    name: 'دکتر الهام توکلی',
    specialty: 'قلب و عروق',
    className: 'B',
    route: 'Route 6',
    frequencyCompleted: 1,
    frequencyTarget: 3,
    locations: [{ label: 'مطب', area: 'راهنمایی', address: 'مشهد، راهنمایی، محدوده سلمان فارسی' }],
  },
  {
    id: 'clinic-pars',
    kind: 'clinic',
    name: 'کلینیک پارس',
    specialty: 'مرکز درمانی',
    className: 'C',
    route: 'Route 8',
    frequencyCompleted: 1,
    frequencyTarget: 2,
    locations: [{ label: 'مرکز', area: 'ملک‌آباد', address: 'مشهد، ملک‌آباد، محدوده فرهاد' }],
  },
] as const

export const demoTodayPlan: readonly DemoPlanEntry[] = [
  { customerId: 'doctor-arman-rezaei', time: '09:00', status: 'completed' },
  { customerId: 'doctor-nazanin-karimi', time: '10:00', status: 'completed' },
  { customerId: 'doctor-mehdi-sharifi', time: '11:00', status: 'next' },
  { customerId: 'pharmacy-sepid', time: '12:00', status: 'completed' },
  { customerId: 'doctor-sara-zamani', time: '14:30', status: 'completed' },
  { customerId: 'doctor-pouya-naderi', time: '15:30', status: 'completed' },
  { customerId: 'doctor-elham-tavakoli', time: '16:30', status: 'completed' },
  { customerId: 'clinic-pars', time: '17:30', status: 'completed' },
  { customerId: 'doctor-arman-rezaei', time: '18:30', status: 'planned' },
] as const

export const demoWeekPlan: readonly DemoWeekDay[] = [
  {
    day: 15,
    weekday: 'یکشنبه',
    route: 'Route 8',
    target: 9,
    customerIds: [
      'doctor-arman-rezaei',
      'doctor-nazanin-karimi',
      'doctor-mehdi-sharifi',
      'pharmacy-sepid',
      'doctor-sara-zamani',
      'doctor-pouya-naderi',
      'doctor-elham-tavakoli',
      'clinic-pars',
    ],
  },
  {
    day: 16,
    weekday: 'دوشنبه',
    route: 'Route 7',
    target: 8,
    customerIds: ['doctor-sara-zamani', 'doctor-pouya-naderi', 'doctor-arman-rezaei', 'doctor-mehdi-sharifi'],
  },
  {
    day: 17,
    weekday: 'سه‌شنبه',
    route: 'Route 8',
    target: 9,
    customerIds: ['doctor-nazanin-karimi', 'doctor-mehdi-sharifi', 'pharmacy-sepid', 'clinic-pars', 'doctor-arman-rezaei'],
  },
  {
    day: 18,
    weekday: 'چهارشنبه',
    route: 'Route 6',
    target: 7,
    customerIds: ['doctor-elham-tavakoli', 'doctor-sara-zamani', 'doctor-pouya-naderi'],
  },
  {
    day: 19,
    weekday: 'پنجشنبه',
    route: 'Route 8',
    target: 8,
    customerIds: ['doctor-arman-rezaei', 'doctor-nazanin-karimi', 'doctor-mehdi-sharifi', 'pharmacy-sepid'],
  },
] as const

export const demoCalendarEvents: readonly DemoCalendarEvent[] = [
  { day: 3, time: '09:00', type: 'visit', title: 'ویزیت‌های Route 7', detail: '۶ ویزیت برنامه‌ریزی‌شده' },
  { day: 6, time: '13:00', type: 'meeting', title: 'میتینگ داخلی', detail: 'مرور عملکرد تیم دیابت' },
  { day: 9, time: '08:30', type: 'trip', title: 'ماموریت یک‌روزه', detail: 'ویزیت خارج از شهر' },
  { day: 15, time: '09:00', type: 'visit', title: 'دکتر آرمان رضایی', detail: 'مطب احمدآباد · Route 8' },
  { day: 15, time: '11:00', type: 'visit', title: 'دکتر مهدی شریفی', detail: 'کوهسنگی · Route 8' },
  { day: 15, time: '13:30', type: 'meeting', title: 'میتینگ تیم', detail: 'جلسه داخلی Workspace' },
  { day: 15, time: '16:30', type: 'visit', title: 'دکتر الهام توکلی', detail: 'راهنمایی · Route 6' },
  { day: 18, time: '00:00', type: 'leave', title: 'مرخصی نیم‌روز', detail: 'مرخصی ثبت‌شده کاربر' },
  { day: 20, time: '00:00', type: 'company_closure', title: 'تعطیلی شرکت', detail: 'تعطیلی ثبت‌شده توسط ادمین شرکت' },
  { day: 23, time: '10:00', type: 'visit', title: 'ویزیت‌های Route 8', detail: '۸ ویزیت برنامه‌ریزی‌شده' },
  { day: 27, time: '15:00', type: 'meeting', title: 'برنامه شرکتی', detail: 'جلسه آموزشی داخلی' },
] as const

export const demoAiSuggestions = [
  {
    customerId: 'doctor-sara-zamani',
    score: 92,
    reason: 'کلاس A، سه ویزیت باقیمانده و هم‌مسیر با برنامه سه‌شنبه',
  },
  {
    customerId: 'doctor-arman-rezaei',
    score: 86,
    reason: 'دو ویزیت باقیمانده و دو لوکیشن قابل انتخاب در Route 8',
  },
  {
    customerId: 'doctor-elham-tavakoli',
    score: 79,
    reason: 'فاصله بیشتر از آخرین ویزیت و هم‌راستایی با Route 6',
  },
] as const

export const demoReportSummary = {
  planned: 9,
  completed: 7,
  achievement: 78,
  uniqueCustomers: 7,
  classAchievement: [
    { label: 'Class A', value: 82 },
    { label: 'Class B', value: 75 },
    { label: 'Class C', value: 67 },
  ],
  activityMix: [
    { label: 'ویزیت پزشک', value: 7 },
    { label: 'ویزیت داروخانه', value: 2 },
    { label: 'میتینگ داخلی', value: 1 },
    { label: 'ماموریت / سفر', value: 0 },
  ],
} as const

export const demoProducts = ['Toujeo', 'Lantus', 'Soliqua'] as const

export function getDemoCustomer(customerId: string): DemoCustomer {
  return demoCustomers.find((customer) => customer.id === customerId) ?? demoCustomers[0]!
}

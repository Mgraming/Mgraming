// Workshop marketplace: specialties, the app-backed warranty policy, and sample listings.
// The sample listings exist only to demonstrate the flow until real workshops are onboarded through a backend.
// They are always flagged `demo: true` and labelled as examples in the UI; their prices are illustrative.

export const SPECIALTIES = {
  mechanic:   { label: 'ميكانيكا',         icon: 'wrench' },
  electric:   { label: 'كهرباء وكمبيوتر',   icon: 'zap' },
  oil:        { label: 'غيار زيت',          icon: 'droplet' },
  tires:      { label: 'كاوتش وترصيص',      icon: 'circle-dot' },
  body:       { label: 'سمكرة ودهان',       icon: 'paint-bucket' },
  ac:         { label: 'تكييف',             icon: 'snowflake' },
  inspection: { label: 'فحص قبل الشراء',     icon: 'scan-search' },
  parts:      { label: 'قطع غيار',          icon: 'package' },
};

export const WARRANTY = {
  days: 30,
  scope: 'قطع الغيار والمصنعية',
  // Shown on every workshop page and on each job. Final wording needs legal review before launch.
  terms: [
    'الضمان بيغطي نفس العطل ونفس القطعة اللي اتغيرت، لمدة ٣٠ يوم من يوم استلام العربية.',
    'لازم الشغل يكون متسجّل من جوه التطبيق مع الورشة.',
    'لو الورشة ما حلّتش المشكلة، فريق باسبور بيتدخل ويوصل لحل.',
    'الضمان مش بيغطي سوء الاستخدام أو الحوادث أو قطع جابها العميل بنفسه.',
  ],
};

const sample = (o) => ({ demo: true, brands: [], warrantyDays: WARRANTY.days, ...o });

export const DEMO_WORKSHOPS = [
  sample({ id: 'demo-1', name: 'مركز صيانة تجريبي ١', area: 'مدينة نصر', lat: 30.0610, lng: 31.3400,
    specialties: ['mechanic', 'oil', 'electric'], hours: 'السبت–الخميس ١٠ص–١٠م',
    about: 'ورشة نموذجية لعرض شكل صفحة الورشة جوه التطبيق.',
    services: [
      { name: 'غيار زيت وفلتر (مصنعية)', price: 150 },
      { name: 'فحص كمبيوتر', price: 300 },
      { name: 'تغيير تيل فرامل أمامي (مصنعية)', price: 250 },
      { name: 'تغيير بوجيهات (مصنعية)', price: 200 },
    ] }),
  sample({ id: 'demo-2', name: 'ورشة تجريبية ٢ للكاوتش', area: 'مصر الجديدة', lat: 30.0950, lng: 31.3300,
    specialties: ['tires'], hours: 'يومياً ٩ص–١١م',
    about: 'مثال لورشة متخصصة في الكاوتش والزوايا.',
    services: [
      { name: 'ترصيص ٤ عجل', price: 200 },
      { name: 'ضبط زوايا', price: 250 },
      { name: 'لحام كاوتش', price: 50 },
    ] }),
  sample({ id: 'demo-3', name: 'مركز تجريبي ٣ للسمكرة', area: 'التجمع الخامس', lat: 30.0150, lng: 31.4750,
    specialties: ['body'], hours: 'السبت–الخميس ٩ص–٧م',
    about: 'مثال لمركز سمكرة ودهان.',
    services: [
      { name: 'دهان رفرف', price: 1500 },
      { name: 'تلميع كامل', price: 900 },
      { name: 'شد صدمة بسيطة', price: 600 },
    ] }),
  sample({ id: 'demo-4', name: 'ورشة تجريبية ٤ للتكييف', area: 'المعادي', lat: 29.9650, lng: 31.2600,
    specialties: ['ac', 'electric'], hours: 'السبت–الخميس ١١ص–٩م',
    about: 'مثال لورشة تكييف وكهرباء.',
    services: [
      { name: 'شحن فريون', price: 450 },
      { name: 'كشف تسريب تكييف', price: 200 },
      { name: 'تنظيف ثلاجة التكييف', price: 600 },
    ] }),
  sample({ id: 'demo-5', name: 'مركز فحص تجريبي ٥', area: 'المهندسين', lat: 30.0580, lng: 31.2050,
    specialties: ['inspection', 'mechanic'], hours: 'يومياً ١٠ص–٨م',
    about: 'مثال لمركز فحص قبل الشراء.',
    services: [
      { name: 'فحص شامل قبل الشراء', price: 1200 },
      { name: 'فحص شاسيه ودهان', price: 600 },
    ] }),
  sample({ id: 'demo-6', name: 'ورشة تجريبية ٦', area: '٦ أكتوبر', lat: 29.9700, lng: 30.9400,
    specialties: ['mechanic', 'oil', 'parts'], hours: 'السبت–الخميس ٩ص–٩م',
    about: 'مثال لورشة ميكانيكا ومعاها قطع غيار.',
    services: [
      { name: 'غيار زيت وفلتر (مصنعية)', price: 120 },
      { name: 'تغيير سير كاتينة (مصنعية)', price: 900 },
    ] }),
  sample({ id: 'demo-7', name: 'مركز صيانة تجريبي ٧', area: 'سموحة', lat: 31.2150, lng: 29.9500,
    specialties: ['mechanic', 'electric', 'ac'], hours: 'السبت–الخميس ١٠ص–١٠م',
    about: 'مثال لمركز صيانة في إسكندرية.',
    services: [
      { name: 'فحص كمبيوتر', price: 250 },
      { name: 'شحن فريون', price: 400 },
    ] }),
];

// Platform commission used by the dashboards. A placeholder for the demo — the real rate is a business decision.
export const PLATFORM_FEE_RATE = 0.10;

export const PART_CATEGORIES = {
  oil:        { label: 'زيوت وفلاتر',     icon: 'droplet' },
  brakes:     { label: 'فرامل',           icon: 'disc' },
  electric:   { label: 'كهرباء وبطاريات',  icon: 'battery-medium' },
  suspension: { label: 'عفشة',            icon: 'cog' },
  engine:     { label: 'موتور',           icon: 'gauge' },
  ac:         { label: 'تكييف',           icon: 'snowflake' },
  tires:      { label: 'كاوتش',           icon: 'circle-dot' },
  body:       { label: 'صاج وفوانيس',      icon: 'car-front' },
  other:      { label: 'أخرى',            icon: 'package' },
};

export const ORDER_STATUSES = {
  new:       { label: 'جديد',         tone: 'soon' },
  confirmed: { label: 'اتأكد',        tone: 'unknown' },
  ready:     { label: 'جاهز/اتشحن',   tone: 'unknown' },
  delivered: { label: 'اتسلّم',       tone: 'ok' },
  cancelled: { label: 'ملغي',         tone: 'overdue' },
};

const store = (o) => ({ demo: true, ...o, catalog: o.catalog.map((p, i) => ({ id: `${o.id}-p${i + 1}`, stock: 10, fits: [], ...p })) });

export const DEMO_STORES = [
  store({ id: 'store-demo-1', name: 'محل قطع غيار تجريبي ١', area: 'مدينة نصر', lat: 30.0590, lng: 31.3350,
    categories: ['oil', 'brakes', 'electric'], hours: 'السبت–الخميس ١٠ص–١٠م', delivery: true,
    about: 'محل نموذجي لعرض شكل الكتالوج جوه التطبيق.',
    catalog: [
      { name: 'فلتر زيت', brand: 'Denso', category: 'oil', condition: 'oem', price: 180, fits: ['Toyota'] },
      { name: 'زيت موتور 5W-30 (٤ لتر)', brand: 'Mobil', category: 'oil', condition: 'original', price: 1450 },
      { name: 'تيل فرامل أمامي', brand: 'Brembo', category: 'brakes', condition: 'aftermarket', price: 950, fits: ['Toyota Corolla', 'Hyundai Elantra'] },
      { name: 'بطارية ٧٠ أمبير', brand: 'Varta', category: 'electric', condition: 'original', price: 4200, stock: 3 },
      { name: 'فلتر هوا', brand: 'Mann', category: 'oil', condition: 'aftermarket', price: 260, fits: ['Hyundai', 'Kia'] },
    ] }),
  store({ id: 'store-demo-2', name: 'محل قطع غيار تجريبي ٢', area: 'مصر الجديدة', lat: 30.0920, lng: 31.3250,
    categories: ['suspension', 'engine', 'ac'], hours: 'يومياً ١١ص–١١م', delivery: false,
    about: 'مثال لمحل متخصص في العفشة والموتور.',
    catalog: [
      { name: 'مساعد أمامي (الزوج)', brand: 'KYB', category: 'suspension', condition: 'aftermarket', price: 3800, fits: ['Hyundai Accent', 'Kia Rio'] },
      { name: 'طقم سير كاتينة', brand: 'Gates', category: 'engine', condition: 'aftermarket', price: 2600, fits: ['Chevrolet Optra', 'Chevrolet Lanos'] },
      { name: 'بوجيهات (٤)', brand: 'NGK', category: 'engine', condition: 'oem', price: 720 },
      { name: 'فلتر تكييف', brand: 'Bosch', category: 'ac', condition: 'aftermarket', price: 210 },
    ] }),
  store({ id: 'store-demo-3', name: 'محل قطع غيار تجريبي ٣', area: 'سموحة', lat: 31.2140, lng: 29.9560,
    categories: ['body', 'tires', 'other'], hours: 'السبت–الخميس ١٠ص–٩م', delivery: true,
    about: 'مثال لمحل صاج وكاوتش في إسكندرية.',
    catalog: [
      { name: 'فانوس أمامي يمين', brand: 'Depo', category: 'body', condition: 'aftermarket', price: 2900, fits: ['Toyota Corolla'] },
      { name: 'كاوتش 195/65 R15', brand: 'Bridgestone', category: 'tires', condition: 'original', price: 3300 },
      { name: 'مساحات (الزوج)', brand: 'Bosch', category: 'other', condition: 'aftermarket', price: 350 },
    ] }),
];

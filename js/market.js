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

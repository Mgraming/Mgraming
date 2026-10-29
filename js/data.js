// Static reference data: service types with default intervals, and a dashboard warning-light guide.
// Intervals are common general-purpose defaults, not manufacturer specs — the owner's manual wins.

export const SERVICE_TYPES = {
  oil:          { label: 'تغيير زيت وفلتر',     icon: '🛢️', km: 10000, months: 6 },
  air_filter:   { label: 'فلتر هواء',            icon: '🌬️', km: 20000, months: 12 },
  ac_filter:    { label: 'فلتر تكييف',           icon: '❄️', km: 20000, months: 12 },
  brakes:       { label: 'فرامل (تيل/طنابير)',    icon: '🛑', km: 30000, months: 24 },
  spark_plugs:  { label: 'بوجيهات',              icon: '⚡', km: 40000, months: 36 },
  coolant:      { label: 'مياه الردياتير',        icon: '🌡️', km: 40000, months: 24 },
  gearbox_oil:  { label: 'زيت فتيس',             icon: '⚙️', km: 60000, months: 48 },
  timing_belt:  { label: 'سير كاتينة',            icon: '🔗', km: 80000, months: 60 },
  tires:        { label: 'كاوتش',                icon: '🛞', km: 40000, months: 48 },
  battery:      { label: 'بطارية',               icon: '🔋', km: null,  months: 30 },
  alignment:    { label: 'ترصيص وضبط زوايا',      icon: '📐', km: 10000, months: 12 },
  repair:       { label: 'إصلاح / عطل',           icon: '🔧', km: null,  months: null },
  bodywork:     { label: 'سمكرة ودهان',           icon: '🎨', km: null,  months: null },
  accident:     { label: 'حادثة',                icon: '💥', km: null,  months: null },
  inspection:   { label: 'فحص شامل',             icon: '🔍', km: null,  months: 12 },
  odometer:     { label: 'قراءة عداد فقط',        icon: '🔢', km: null,  months: null },
  other:        { label: 'أخرى',                 icon: '📝', km: null,  months: null },
};

export const SOURCES = {
  owner:   { label: 'مسجّل من المالك', weight: 1 },
  invoice: { label: 'بفاتورة مرفقة',   weight: 2 },
  // Reserved for phase 2 (workshop app with a backend that signs the record).
  workshop:{ label: 'موثّق من الورشة', weight: 3 },
};

export const PART_GRADES = {
  original:    'أصلي (وكالة)',
  oem:         'OEM / مصنّع أصلي',
  aftermarket: 'بديل تجاري',
  used:        'مستعمل',
};

// Severity: red = stop driving safely ASAP, amber = get it checked soon, info = informational.
export const WARNING_LIGHTS = [
  { icon: '🌡️', name: 'حرارة المحرك', severity: 'red',
    advice: 'اركن في مكان آمن واطفي المحرك. متفتحش غطا الردياتير وهو سخن. كمّل سواقة ممكن تبوّظ المحرك.' },
  { icon: '🛢️', name: 'ضغط الزيت', severity: 'red',
    advice: 'اطفي المحرك في أقرب مكان آمن واكشف على مستوى الزيت. السواقة بضغط زيت واطي ممكن تدمّر المحرك.' },
  { icon: '🔋', name: 'الشحن / البطارية', severity: 'amber',
    advice: 'غالباً مشكلة في الدينامو أو السير. العربية ممكن تقف لما البطارية تفضى، روح أقرب ورشة.' },
  { icon: '🛑', name: 'الفرامل', severity: 'red',
    advice: 'اتأكد إن فرامل اليد نازلة. لو لسه منورة: ممكن زيت الفرامل ناقص — متسوقش لحد ما تتفحص.' },
  { icon: '⚠️', name: 'لمبة المحرك (Check Engine)', severity: 'amber',
    advice: 'لو ثابتة: افحص بجهاز كمبيوتر قريب. لو بتفلاش أو العربية بترعش: قلّل السرعة وروح الورشة فوراً.' },
  { icon: '🅰️', name: 'ABS', severity: 'amber',
    advice: 'الفرامل العادية شغالة غالباً، بس مانع الانغلاق لأ. سوق بحذر وافحصها قريب.' },
  { icon: '🛞', name: 'ضغط الكاوتش (TPMS)', severity: 'amber',
    advice: 'اكشف على ضغط الكاوتش في أقرب بنزينة واعرف لو في خرم.' },
  { icon: '👤', name: 'الإيرباج', severity: 'amber',
    advice: 'الإيرباج ممكن ميشتغلش وقت الحادثة. افحصه في مركز متخصص.' },
  { icon: '⛽', name: 'البنزين احتياطي', severity: 'info',
    advice: 'موّن في أقرب فرصة — السواقة على الاحتياطي باستمرار مش كويسة لطلمبة البنزين.' },
];

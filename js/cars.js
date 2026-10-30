// Brands and models common on Egyptian roads. Not exhaustive — the picker always allows typing a custom value.
export const BRANDS = [
  { id: 'toyota', ar: 'تويوتا', en: 'Toyota', models: ['Corolla', 'Corolla Cross', 'Yaris', 'Belta', 'Camry', 'C-HR', 'RAV4', 'Rush', 'Avanza', 'Fortuner', 'Hilux', 'Land Cruiser', 'Prado'] },
  { id: 'hyundai', ar: 'هيونداي', en: 'Hyundai', models: ['Elantra', 'Accent', 'Accent RB', 'Verna', 'i10', 'Grand i10', 'i20', 'i30', 'Bayon', 'Creta', 'Tucson', 'Santa Fe', 'Matrix'] },
  { id: 'kia', ar: 'كيا', en: 'Kia', models: ['Cerato', 'Rio', 'Picanto', 'Pegas', 'Soul', 'Sonet', 'Seltos', 'Sportage', 'Sorento', 'Carens'] },
  { id: 'nissan', ar: 'نيسان', en: 'Nissan', models: ['Sunny', 'Sentra', 'Tiida', 'Juke', 'Kicks', 'Qashqai', 'X-Trail', 'Pathfinder', 'Patrol'] },
  { id: 'chevrolet', ar: 'شيفروليه', en: 'Chevrolet', models: ['Optra', 'Aveo', 'Lanos', 'Cruze', 'Spark', 'Captiva', 'N300', 'T-Series'] },
  { id: 'mitsubishi', ar: 'ميتسوبيشي', en: 'Mitsubishi', models: ['Lancer', 'Attrage', 'Mirage', 'Xpander', 'Eclipse Cross', 'Outlander', 'Pajero', 'L200'] },
  { id: 'suzuki', ar: 'سوزوكي', en: 'Suzuki', models: ['Swift', 'Dzire', 'Ciaz', 'Baleno', 'Alto', 'Celerio', 'S-Presso', 'Ertiga', 'Vitara', 'Jimny'] },
  { id: 'renault', ar: 'رينو', en: 'Renault', models: ['Logan', 'Sandero', 'Sandero Stepway', 'Taliant', 'Megane', 'Fluence', 'Duster', 'Kadjar', 'Austral'] },
  { id: 'peugeot', ar: 'بيجو', en: 'Peugeot', models: ['206', '207', '301', '308', '408', '508', '2008', '3008', '5008'] },
  { id: 'skoda', ar: 'سكودا', en: 'Skoda', models: ['Fabia', 'Rapid', 'Scala', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq'] },
  { id: 'volkswagen', ar: 'فولكس فاجن', en: 'Volkswagen', models: ['Polo', 'Golf', 'Jetta', 'Passat', 'T-Roc', 'Tiguan', 'Touareg'] },
  { id: 'fiat', ar: 'فيات', en: 'Fiat', models: ['128', 'Shahin', 'Uno', 'Siena', 'Punto', 'Tipo', '500'] },
  { id: 'mg', ar: 'إم جي', en: 'MG', models: ['MG 3', 'MG 5', 'MG 6', 'MG GT', 'MG ZS', 'MG HS', 'MG RX5', 'MG 4'] },
  { id: 'chery', ar: 'شيري', en: 'Chery', models: ['Arrizo 5', 'Tiggo 3', 'Tiggo 4 Pro', 'Tiggo 7', 'Tiggo 7 Pro', 'Tiggo 8', 'Envy'] },
  { id: 'byd', ar: 'بي واي دي', en: 'BYD', models: ['F3', 'L3', 'Song', 'Atto 3', 'Seal'] },
  { id: 'geely', ar: 'جيلي', en: 'Geely', models: ['Emgrand', 'Coolray', 'Okavango', 'Tugella'] },
  { id: 'haval', ar: 'هافال', en: 'Haval', models: ['H2', 'H6', 'Jolion', 'Dargo'] },
  { id: 'jetour', ar: 'جيتور', en: 'Jetour', models: ['X70', 'X70 Plus', 'X90', 'Dashing'] },
  { id: 'honda', ar: 'هوندا', en: 'Honda', models: ['City', 'Civic', 'Accord', 'HR-V', 'CR-V'] },
  { id: 'mazda', ar: 'مازدا', en: 'Mazda', models: ['Mazda 2', 'Mazda 3', 'Mazda 6', 'CX-3', 'CX-5', 'CX-9'] },
  { id: 'opel', ar: 'أوبل', en: 'Opel', models: ['Corsa', 'Astra', 'Vectra', 'Insignia', 'Mokka', 'Crossland', 'Grandland'] },
  { id: 'citroen', ar: 'ستروين', en: 'Citroën', models: ['C3', 'C-Elysée', 'C4', 'C4 X', 'C5 Aircross'] },
  { id: 'seat', ar: 'سيات', en: 'Seat', models: ['Ibiza', 'Leon', 'Arona', 'Ateca', 'Tarraco'] },
  { id: 'ford', ar: 'فورد', en: 'Ford', models: ['Fiesta', 'Focus', 'Fusion', 'EcoSport', 'Kuga', 'Explorer', 'Ranger'] },
  { id: 'mercedes', ar: 'مرسيدس', en: 'Mercedes-Benz', models: ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'GLA', 'GLC', 'GLE'] },
  { id: 'bmw', ar: 'بي إم دبليو', en: 'BMW', models: ['1 Series', '3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6'] },
  { id: 'audi', ar: 'أودي', en: 'Audi', models: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'] },
  { id: 'jeep', ar: 'جيب', en: 'Jeep', models: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Wrangler'] },
  { id: 'lada', ar: 'لادا', en: 'Lada', models: ['2107', 'Granta', 'Vesta', 'Niva'] },
  { id: 'proton', ar: 'بروتون', en: 'Proton', models: ['Saga', 'Persona', 'Gen-2', 'X50', 'X70'] },
];

export const findBrand = name => BRANDS.find(b => b.ar === name || b.en === name) || null;

export function yearOptions(now = new Date().getFullYear()) {
  const years = [];
  for (let y = now + 1; y >= 1980; y--) years.push(y);
  return years;
}

// Workshop search categories. Results come from Google Maps — we never list workshops we can't vouch for.
export const WORKSHOP_CATEGORIES = [
  { id: 'dealer',     icon: '🏢', label: 'مركز خدمة معتمد (توكيل)', query: b => `مركز خدمة ${b} توكيل معتمد` },
  { id: 'mechanic',   icon: '🔧', label: 'ميكانيكا',               query: b => `ورشة ميكانيكا ${b}` },
  { id: 'electric',   icon: '⚡', label: 'كهرباء وكمبيوتر',          query: () => 'كهربائي سيارات فحص كمبيوتر' },
  { id: 'oil',        icon: '🛢️', label: 'غيار زيت',                query: () => 'مركز تغيير زيت سيارات' },
  { id: 'tires',      icon: '🛞', label: 'كاوتش وترصيص',            query: () => 'كاوتش وترصيص وزوايا سيارات' },
  { id: 'body',       icon: '🎨', label: 'سمكرة ودهان',             query: () => 'سمكرة ودهان سيارات' },
  { id: 'ac',         icon: '❄️', label: 'تكييف سيارات',             query: () => 'تصليح تكييف سيارات' },
  { id: 'inspection', icon: '🔍', label: 'فحص قبل الشراء',           query: () => 'مركز فحص سيارات مستعملة' },
  { id: 'parts',      icon: '🔩', label: 'قطع غيار',                 query: b => `قطع غيار ${b}` },
];

export function mapsSearchUrl(query) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' بالقرب مني');
}

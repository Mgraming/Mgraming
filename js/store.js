// Local-first persistence. Everything stays on the device until a backend exists (phase 2).
const KEY = 'carpass.v1';

const empty = () => ({ cars: [], activeCarId: null });

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

// Returns false when the browser quota is exceeded (usually too many invoice photos).
export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportCar(car) {
  return JSON.stringify({ kind: 'carpass-passport', v: 1, exportedAt: new Date().toISOString(), car }, null, 2);
}

export function parseImport(text) {
  const data = JSON.parse(text);
  if (data.kind !== 'carpass-passport' || !data.car?.make) throw new Error('not a passport file');
  return data.car;
}

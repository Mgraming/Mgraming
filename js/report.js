import { decodeReport, expandReport } from './logic.js';
import { renderReport } from './report-view.js';

const view = document.getElementById('view');

async function main() {
  const code = location.hash.slice(1);
  if (!code) {
    view.innerHTML = '<div class="empty-state">🔍<p>مفيش تقرير في اللينك ده.</p></div>';
    return;
  }
  try {
    renderReport(view, expandReport(await decodeReport(code)));
  } catch {
    view.innerHTML = '<div class="empty-state">⚠️<p>اللينك ده ناقص أو بايظ. اطلب من البائع يبعته تاني.</p></div>';
  }
}

main();

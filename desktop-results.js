// Extracted desktop card renderer. Callbacks use extension storage, not desktop endpoints.
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    function formatNumber(value, digits = 1) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(digits) : '--';
    }
    function formatResourceCapacity(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= 0
        ? Math.round(numeric).toLocaleString('en-US')
        : '--';
    }
    export function matchedColumnCount() {
      const width = document.getElementById('matches')?.clientWidth || window.innerWidth;
      return width >= 660 ? Math.max(3, Math.floor(width / 280)) : width >= 460 ? 2 : 1;
    }
    function getZoneBadge(zone) {
      const z = (zone || 'sentinel').toLowerCase();
      if (z === 'dead') {
        return `<span class="px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold text-xs">☠️ Dead</span>`;
      } else if (z === 'open') {
        return `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold text-xs">⚠️ Open</span>`;
      }
      return `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold text-xs">🛡️ Sentinel</span>`;
    }
    function getOreBadge(type) {
      const map = {
        'ore': { label: 'Ore', color: 'text-amber-300 border-amber-500/50 bg-amber-500/20' },
        'gas': { label: 'Gas', color: 'text-emerald-300 border-emerald-500/50 bg-emerald-500/20' },
        'plasma': { label: 'Plasma', color: 'text-rose-300 border-rose-500/50 bg-rose-500/20' },
        'ice': { label: 'Ice', color: 'text-cyan-300 border-cyan-500/50 bg-cyan-500/20' },
      };
      const info = map[type] || { label: escapeHtml(type), color: 'text-slate-200 border-slate-700 bg-slate-800' };
      return `<span class="px-2 py-0.5 rounded border text-xs font-bold ${info.color}">${info.label}</span>`;
    }
    export function renderDesktopResults(systems, {copySystemName, setSystemSent}) {
      const container = document.getElementById('matches');
      if (systems.length === 0) {
        container.innerHTML = `
          <div class="col-span-full p-12 text-center">
            <div class="text-slate-400 text-sm font-semibold">No exact belt results saved yet.</div>
          </div>
        `;
        return;
      }

      const renderSystemCard = (s) => `
        <article class="p-2 ${s.sent_at ? 'bg-fuchsia-950/10 border-fuchsia-400/70' : 'bg-[#080e1e] border-slate-700/80'} hover:bg-[#0c152b] rounded-xl border shadow-lg transition space-y-1.5 self-start">
          
          <!-- Clear System Header -->
          <div class="matched-header pb-1.5 border-b border-slate-800">
            <div class="flex flex-wrap items-center gap-1.5">
              <!-- VIBRANT BLUE SYSTEM BADGE (1-Click Copy) -->
              <button type="button" data-copy-system="${escapeHtml(s.system_name || '')}" title="Copy system name" class="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-orbitron font-extrabold text-sm tracking-wider border border-blue-400/60 shadow-[0_0_10px_rgba(37,99,235,0.45)] flex items-center gap-1.5 transition active:scale-95">
                <span>${escapeHtml(s.system_name || 'Unknown System')}</span>
                <svg class="w-3.5 h-3.5 text-blue-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>

              ${getZoneBadge(s.security_zone)}
              ${s.sent_at
                ? `<button type="button" data-toggle-sent="${escapeHtml(s.system_id)}" data-sent="true" title="Click to clear" class="rounded border border-fuchsia-300 bg-fuchsia-600 px-2 py-1 text-[10px] font-extrabold tracking-wide text-white shadow-[0_0_10px_rgba(217,70,239,0.45)] transition hover:bg-fuchsia-500">SENT</button>`
                : `<button type="button" data-toggle-sent="${escapeHtml(s.system_id)}" data-sent="false" title="Click to mark sent" class="rounded border border-violet-500/50 bg-violet-500/15 px-2 py-1 text-[10px] font-bold tracking-wide text-violet-200 transition hover:bg-violet-500/30">SEND</button>`}
            </div>

            <div class="matched-distance" title="Distance from selected scan origin">
              <div class="font-mono text-sky-400 font-extrabold text-sm">${formatNumber(s.distance)} ly</div>
            </div>
          </div>

          <!-- Every row below is a saved exact field detail. -->
          <div class="space-y-1.5">
            ${s.belts.map(b => `
              <div class="flex flex-wrap items-center justify-between gap-1.5 bg-slate-900/90 border border-slate-700/60 rounded-lg px-1.5 py-1.5 text-xs hover:border-slate-600 transition">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/60 text-amber-300 font-mono font-extrabold text-sm shadow-[0_0_6px_rgba(245,158,11,0.25)]">
                    ×${formatNumber(b.richness, 2)}
                  </span>
                  ${getOreBadge(b.field_type)}
                </div>

                <div class="belt-numbers font-mono text-xs">
                  <span class="text-slate-400 font-semibold">${formatResourceCapacity(b.total_resources)}</span>
                  <span class="belt-percent text-emerald-400 font-bold">${Number(b.remaining_pct).toLocaleString(undefined, {maximumFractionDigits:1})}%</span>
                </div>
              </div>
            `).join('')}
          </div>
        </article>
      `;

      const count = matchedColumnCount();

      const ordered = [...systems].sort((a, b) => Number(a.distance) - Number(b.distance) || String(a.system_name).localeCompare(String(b.system_name)));
      container.innerHTML = '<div class="grid gap-2 items-start" style="grid-template-columns:repeat(' + count + ',minmax(0,1fr))">' +
        ordered.map(renderSystemCard).join('') + '</div>';
      container.querySelectorAll('[data-copy-system]').forEach(button => {
        button.addEventListener('click', () => copySystemName(button.dataset.copySystem || ''));
      });
      container.querySelectorAll('[data-toggle-sent]').forEach(button => {
        button.addEventListener('click', () => setSystemSent(
          button.dataset.toggleSent,
          button.dataset.sent !== 'true',
        ));
      });
    }

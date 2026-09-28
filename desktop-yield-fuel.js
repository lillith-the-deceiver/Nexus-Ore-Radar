// Personal renderer; only the host ID and exported function name differ.
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    export function renderDesktopYieldFuel(data) {
      const container = document.getElementById('yield-tables');
      if (!container) return;
      const groups = data?.groups || [];
      const openRows = new Set([...container.querySelectorAll('details[open]')].map(el => el.dataset.fuelKey));
      const stat = (value, fuel = false) => value == null ? '—' : (fuel ? '≈' : '') + formatAnalyticsResource(value) + (fuel ? ' H₂' : '');
      const range = (low, high, fuel = false) => low == null || high == null ? '—' : (fuel ? '≈' : '') + formatAnalyticsResource(low) + '–' + formatAnalyticsResource(high) + (fuel ? ' H₂' : '');
      container.innerHTML = groups.map(group => `
        <div class="min-w-0 rounded-xl border border-slate-700 bg-slate-950/55 px-3.5 pt-3.5 pb-1">
          <div class="mb-3.5 flex flex-wrap items-center gap-2"><span class="text-sm font-bold text-slate-100">${group.category === 'excavators_only' ? 'Excavators only' : 'Dedicated ships'}</span><span class="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">${Number(group.runs || 0).toLocaleString()} runs</span></div>
          <div class="fuel-row pb-2 text-[10px] uppercase text-slate-400"><span>Resource</span><span class="text-right">Yield / run</span><span class="text-right" title="New dispatch API quotes merged with historical estimates, including every dispatched ship. Quotes are not transaction receipts; return-trip charging unverified.">Fuel / run (H₂)</span><span class="text-right">Runs</span></div>
          ${(group.rows || []).map(row => `<details class="border-t border-slate-800" data-fuel-key="${group.category}:${row.belt}" ${openRows.has(group.category + ':' + row.belt) ? 'open' : ''}><summary class="fuel-row cursor-pointer py-3 text-xs">
            <span class="font-bold ${row.runs ? 'text-slate-200' : 'text-slate-500'}"><span class="fuel-chevron" aria-hidden="true"></span>${escapeHtml(row.label)}</span>
            <span class="text-right font-mono font-bold text-emerald-300">${row.average_yield == null ? '—' : formatAnalyticsResource(row.average_yield)}</span>
            <span class="text-right font-mono text-amber-300" title="${Number(row.api_quote_runs || 0)} API quotes · ${Number(row.estimated_runs || 0)} estimates · ${Number(row.runs || 0) - Number(row.fuel_runs || 0)} unavailable. Full dispatched fleet; quotes are not transaction receipts.">${row.average_fuel == null ? '—' : `≈${formatAnalyticsResource(row.average_fuel)}`}</span>
            <span class="text-right font-mono text-slate-400">${Number(row.runs || 0).toLocaleString()}</span>
          </summary><div class="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-900 p-3 text-xs">
            <div><div class="mb-1 text-slate-400">Median yield per run</div><div class="font-mono text-emerald-300">${stat(row.median_yield)}</div></div>
            <div><div class="mb-1 text-slate-400">Middle 50% of runs yield</div><div class="font-mono text-emerald-300">${range(row.yield_q1, row.yield_q3)}</div></div>
            <div><div class="mb-1 text-slate-400">Median fuel usage per run</div><div class="font-mono text-amber-300">${stat(row.median_fuel, true)}</div></div>
            <div><div class="mb-1 text-slate-400">Middle 50% of runs fuel usage</div><div class="font-mono text-amber-300">${range(row.fuel_q1, row.fuel_q3, true)}</div></div>
          </div></details>`).join('')}
        </div>`).join('');
    }

    function formatAnalyticsResource(value) {
      const numeric = Number(value) || 0;
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.max(0, numeric));
    }


export function desktopYieldFuelData(tables){
 const belts={ore:'ore',hydrogen:'gas',plasma_core:'plasma',cryo_ice:'ice'};
 return {groups:Object.entries(tables).map(([category,table])=>({
  category:category==='excavators'?'excavators_only':'dedicated_ships',runs:table.runs,
  rows:table.rows.map(r=>({belt:belts[r.key],label:r.label,runs:r.runs,average_yield:r.mean,average_fuel:r.fuelMean,median_yield:r.median,yield_q1:r.low,yield_q3:r.high,median_fuel:r.fuelMedian,fuel_q1:r.fuelLow,fuel_q3:r.fuelHigh,fuel_runs:r.fuelRuns,api_quote_runs:r.apiQuoteRuns,estimated_runs:r.estimatedRuns}))
 }))};
}


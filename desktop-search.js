// Personal App search controls, with extension-only IDs retained by the host.
export const desktopSearch=`
<div id="search-controls" class="flex flex-col gap-2 bg-slate-900/95 border border-slate-800 rounded-xl p-3 shadow-xl text-sm min-h-0">
  <div class="space-y-2.5">
    <div class="space-y-1">
      <label class="block text-xs font-bold uppercase tracking-wider text-sky-400">📍 Search Origin:</label>
      <select id="search-origin" class="w-full bg-slate-950 border border-sky-500/40 rounded-lg px-3 py-2 text-sm text-white font-bold focus:border-sky-400 focus:outline-none"><option value="">Loading saved locations...</option></select>
      <div class="flex items-center justify-end gap-2"><button data-onclick="openLocationsModal()" class="shrink-0 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[11px] font-bold transition">Manage Locations</button></div>
    </div>
    <div class="space-y-1">
      <label class="block text-xs font-bold uppercase tracking-wider text-slate-300">Ore Richness Multiplier:</label>
      <div class="grid grid-cols-7 gap-1.5 items-center">
        <button data-onclick="setRichness(1.0001, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/50">&gt;1.0x</button>
        <button data-onclick="setRichness(1.1, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">&gt;1.1x</button>
        <button data-onclick="setRichness(1.2, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">&gt;1.2x</button>
        <button data-onclick="setRichness(1.3, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">&gt;1.3x</button>
        <button data-onclick="setRichness(1.4, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">&gt;1.4x</button>
        <button data-onclick="setRichness(0.0, this)" class="rich-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">All</button>
        <div class="flex items-center justify-center bg-slate-950 border border-slate-700 rounded-md px-1.5 py-1"><span class="text-amber-400/80 font-bold font-mono text-[11px] mr-0.5">×</span><input type="number" id="custom-richness" step="0.05" min="0" max="10" placeholder="1.25" class="w-full bg-transparent text-amber-300 font-mono font-bold text-xs focus:outline-none text-center"></div>
      </div>
    </div>
    <div class="grid grid-cols-12 gap-2.5">
      <div class="col-span-5 space-y-1"><label class="block text-xs font-bold uppercase tracking-wider text-slate-400">Resource Level:</label><div class="grid grid-cols-2 gap-1"><button data-onclick="setPct(100.0, this)" class="pct-btn py-1.5 rounded-md text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">★ 100%</button><button data-onclick="setPct(0.0, this)" class="pct-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">Any %</button></div></div>
      <div class="col-span-7 space-y-1"><label class="block text-xs font-bold uppercase tracking-wider text-slate-400">Security Zone:</label><div class="grid grid-cols-4 gap-1"><button data-onclick="setZone('all', this)" class="zone-btn py-1.5 rounded-md text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/50">All</button><button data-onclick="setZone('sentinel', this)" class="zone-btn py-1.5 rounded-md text-[11px] font-bold bg-slate-800 text-emerald-400 border border-slate-700">Sentinel</button><button data-onclick="setZone('open', this)" class="zone-btn py-1.5 rounded-md text-[11px] font-bold bg-slate-800 text-amber-400 border border-slate-700">Open</button><button data-onclick="setZone('dead', this)" class="zone-btn py-1.5 rounded-md text-[11px] font-bold bg-slate-800 text-red-400 border border-slate-700">Dead</button></div></div>
    </div>
    <div class="space-y-1"><label class="block text-xs font-bold uppercase tracking-wider text-slate-400">Belt Resource Type:</label><div class="grid grid-cols-5 gap-1.5"><button data-onclick="setOreType('all', this)" class="ore-btn py-1.5 rounded-md text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">All Belts</button><button data-onclick="setOreType('ore', this)" class="ore-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-amber-300 border border-slate-700">Ore Belt</button><button data-onclick="setOreType('gas', this)" class="ore-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-emerald-300 border border-slate-700">Gas Cloud</button><button data-onclick="setOreType('plasma', this)" class="ore-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-rose-300 border border-slate-700">Plasma Nebula</button><button data-onclick="setOreType('ice', this)" class="ore-btn py-1.5 rounded-md text-xs font-bold bg-slate-800 text-cyan-300 border border-slate-700">Ice Field</button></div></div>
  </div>
  <section class="mt-3 border-t border-slate-800 pt-3 space-y-2" aria-label="Destination sorting">
    <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400">Optimize yield / fuel / time</h2>
    <div role="group" aria-label="Optimize yield / fuel / time" class="flex gap-2"><button type="button" id="destination-off" aria-pressed="true">Off</button><button type="button" id="destination-on" aria-pressed="false">On</button></div>
    <p class="text-xs text-slate-400">Does not work with All Belts selected.</p>
    <details id="destination-fleet-panel"><summary>Fleet &amp; presets</summary><section><h3>Mining ships</h3><div id="destination-mining-ships" class="destination-ship-grid"></div></section><section><h3>Escorts</h3><div id="destination-escort-ships" class="destination-ship-grid"></div></section><div class="destination-preset-actions"><input id="destination-preset-name" placeholder="Preset name" aria-label="Fleet preset name" maxlength="80"><button type="button" id="destination-save">Save preset</button><select id="destination-presets" aria-label="Saved fleet presets"><option value="">Load preset…</option></select><button type="button" id="destination-remove">Remove preset</button></div></details>
    <p id="destination-status" role="status" class="text-xs text-slate-400"></p>
  </section>
  <section class="mt-3 border-t border-slate-800 pt-3 space-y-2" aria-labelledby="data-updates-title">
    <h2 id="data-updates-title" class="text-xs font-bold uppercase tracking-wider text-sky-400">Data</h2>
    <div id="data-controls"><label id="data-radius-label" for="radius"><span class="block text-[11px] font-bold text-slate-400">Update radius around selected origin</span></label><div id="data-radius-field" class="flex items-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5"><input id="radius" type="number" min="1" max="10000" step="10" value="350" inputmode="decimal" class="min-w-0 w-full bg-transparent font-mono text-sm font-bold text-amber-300 outline-none"><span class="ml-2 text-xs font-bold text-slate-500">ly</span></div><button id="scan" class="rounded-lg bg-amber-600 disabled:bg-slate-700 px-3 py-2 text-xs font-bold text-white">⚡ Update belts</button><button id="cancel-scan" class="hidden rounded-lg border border-rose-500/50 bg-rose-950/50 px-2.5 py-2 text-xs font-bold text-rose-200">Cancel</button></div>
    <p id="refresh-last-updated" class="text-[11px] font-mono text-slate-500">Last updated: checking…</p><p id="scan-status" class="text-xs font-semibold leading-snug" role="status"></p>
  </section>
</div>`;

// Source-extracted saved-location dialog and list.
export const desktopLocations="<div id=\"locations-modal\" class=\"fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"locations-modal-title\">\n    <div class=\"bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto\">\n      <div class=\"flex items-center justify-between border-b border-slate-800 pb-3\">\n        <div>\n          <h3 id=\"locations-modal-title\" class=\"text-base font-orbitron font-bold text-emerald-400 flex items-center gap-2\"><span>📍</span> My Saved Locations</h3>\n          <p class=\"mt-1 text-[11px] text-slate-400\">Local-only search origins. This radar does not request or store a Nexus Legacy session token.</p>\n        </div>\n        <button data-onclick=\"closeLocationsModal()\" class=\"text-slate-400 hover:text-white text-lg font-bold\" aria-label=\"Close saved locations\">&times;</button>\n      </div>\n\n      <div class=\"grid grid-cols-1 sm:grid-cols-2 gap-3\">\n        <div class=\"space-y-1.5\">\n          <label class=\"block text-xs font-bold text-slate-400\" for=\"location-label-input\">Custom name <span class=\"text-slate-600\">(optional)</span></label>\n          <input id=\"location-label-input\" maxlength=\"80\" placeholder=\"Homeworld\" class=\"w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none\">\n        </div>\n        <div class=\"space-y-1.5\">\n          <label class=\"block text-xs font-bold text-slate-400\" for=\"location-system-input\">Planet or system location</label>\n          <input id=\"location-system-input\" maxlength=\"120\" placeholder=\"G17-31-2, G17-31, or #5531\" class=\"w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none\">\n        </div>\n      </div>\n      <p class=\"text-[11px] leading-relaxed text-slate-500\">Use a system or planet location such as <span class=\"text-slate-300\">G17-31-2</span>.</p>\n\n      <div class=\"flex flex-wrap items-center justify-between gap-2\">\n        <button data-onclick=\"addSavedLocation()\" id=\"btn-save-location\" class=\"px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white shadow-lg transition\">Save Location</button>\n      </div>\n\n      <div id=\"locations-message\" class=\"text-xs font-bold hidden\" aria-live=\"polite\"></div>\n      <div id=\"saved-locations-list\" class=\"space-y-2 border-t border-slate-800 pt-3\"></div>\n\n      <div class=\"flex justify-end pt-2\">\n        <button data-onclick=\"closeLocationsModal()\" class=\"px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition\">Done</button>\n      </div>\n    </div>\n  </div>";
    export function renderDesktopLocations(savedLocations,reorderSavedLocation,deleteSavedLocation) {
      const list = document.getElementById('saved-locations-list');
      list.replaceChildren();
      if (savedLocations.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'text-xs text-slate-500 py-2';
          empty.textContent = 'No saved locations yet.';
        list.appendChild(empty);
        return;
      }
      savedLocations.forEach((location, index) => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2';
        const text = document.createElement('div');
        text.className = 'min-w-0';
        const title = document.createElement('div');
        title.className = 'truncate text-xs font-bold text-white';
        title.textContent = `📍 ${location.label}`;
        const detail = document.createElement('div');
        detail.className = 'truncate text-[11px] text-slate-400 font-mono';
        detail.textContent = location.system_name || 'Unknown location';
        text.append(title, detail);
        const controls = document.createElement('div');
        controls.className = 'flex shrink-0 items-center gap-1';
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'rounded px-1.5 py-1 text-xs font-bold text-sky-300 hover:bg-sky-950/60 disabled:opacity-30';
        up.textContent = '↑';
        up.title = 'Move up';
        up.disabled = index === 0;
        up.addEventListener('click', () => reorderSavedLocation(index, index - 1));
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'rounded px-1.5 py-1 text-xs font-bold text-sky-300 hover:bg-sky-950/60 disabled:opacity-30';
        down.textContent = '↓';
        down.title = 'Move down';
        down.disabled = index === savedLocations.length - 1;
        down.addEventListener('click', () => reorderSavedLocation(index, index + 1));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'shrink-0 rounded px-2 py-1 text-[11px] font-bold text-rose-300 hover:bg-rose-950/60';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => deleteSavedLocation(location.id, location.label));
        controls.append(up, down, remove);
        row.append(text, controls);
        list.appendChild(row);
      });
    }

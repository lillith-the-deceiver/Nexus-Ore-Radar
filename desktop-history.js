// Renderer extracted from desktop index.html; only host IDs and formatting adapters differ.
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatAnalyticsResource=v=>Number(v||0).toLocaleString();
    export function renderDesktopHistory(data) {

      const el = document.getElementById('history-charts');




      const buckets = data.buckets || [];
      const unit = data.granularity || 'day';
      const dateLabel = epoch => new Date(epoch*1000).toLocaleDateString(undefined,{day:'2-digit',month:'short'});
      document.getElementById('history-period').textContent = buckets.length
        ? `${dateLabel(buckets[0].start)} – ${dateLabel(buckets[buckets.length-1].start)} · ${{hour:'Hourly',day:'Daily',week:'Weekly'}[unit]}` : '';
      if (el.hidden) return;
      if (!buckets.length) { el.innerHTML = '<div class="text-xs text-slate-400">No recorded yields in this period.</div>'; return; }
      const colors = ['#eebd35','#3ed8a5','#c389ef','#42c9ec'];
      el.innerHTML = (data.series || []).map((series,i) => `<div class="yield-history-panel"><div class="history-heading"><span style="color:${colors[i]}">${escapeHtml(series.label)}</span><span class="font-mono text-xs text-emerald-300">${formatAnalyticsResource(series.total)}</span></div><svg role="img" aria-label="${escapeHtml(series.label)} yield over time"></svg></div>`).join('');
      el.querySelectorAll('svg').forEach((svg,i) => {
        const series=data.series[i], w=Math.max(230,svg.getBoundingClientRect().width), left=58,right=w-8,top=22,bottom=130;
        svg.setAttribute('viewBox',`0 0 ${w} 170`);
        const max=Math.max(1,...series.values.map(v=>v||0))*1.1, step=(right-left)/buckets.length;
        const compact=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e3?(v/1e3).toFixed(0)+'K':Math.round(v).toString();
        let markup='<text x="58" y="13">Yield</text>';
        for(let t=0;t<3;t++) { const y=bottom-(bottom-top)*t/2;markup+=`<path d="M${left} ${y}H${right}" fill="none" stroke="#26324a"/><text x="${left-7}" y="${y+4}" text-anchor="end">${compact(max*t/2)}</text>`; }
        const stride=Math.max(1,Math.ceil(buckets.length/Math.max(2,Math.floor((right-left)/58))));
        buckets.forEach((bucket,k)=>{
          const value=series.values[k], x=left+step*k;
          const when=unit==='hour'?new Date(bucket.start*1000).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}):dateLabel(bucket.start);
          const detail=`${when} · ${value===null?'No data':Number(value).toLocaleString()+' units'}${bucket.partial?' · Partial period':''}`;
          if(value!==null) {const height=value/max*(bottom-top);markup+=`<rect x="${x+step*.2}" y="${bottom-height}" width="${step*.6}" height="${height}" rx="2" fill="${colors[i]}"/>`;}
          markup+=`<rect x="${x}" y="${top}" width="${step}" height="${bottom-top}" fill="transparent"><title>${escapeHtml(detail)}</title></rect>`;
          if(k%stride===0) markup+=`<text x="${x+step/2}" y="150" text-anchor="middle">${escapeHtml(when)}</text>`;
        });
        svg.innerHTML=markup;
      });
    }

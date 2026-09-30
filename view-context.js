export async function bindDashboardView({chromeApi=chrome,documentApi=document,href=location.href,openFullView,openSidePanel}={}){
 let sidePanel=false;
 try{sidePanel=new URL(href).searchParams.get('view')==='side-panel';}catch{}
 documentApi.body.classList.toggle('side-panel',sidePanel);
 const fullButton=documentApi.getElementById('open-full-view');
 if(fullButton){fullButton.hidden=!sidePanel;fullButton.onclick=sidePanel?openFullView:null;}
 const sideButton=documentApi.getElementById('open-side-panel');
 if(sideButton){sideButton.hidden=sidePanel;sideButton.onclick=sidePanel?null:openSidePanel;}
 return sidePanel;
}

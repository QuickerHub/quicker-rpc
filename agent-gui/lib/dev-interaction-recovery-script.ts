/**
 * Inline dev recovery — reload before React when HMR leaves onClick handlers dead.
 * Native <a href> still works; React onClick does not.
 */
export const DEV_INTERACTION_RECOVERY_SCRIPT = `(function(){try{
var KEY="qa-react-hooks-recovery-count";
var MAX=3;
function fault(m){
if(!m)return false;
if(m.indexOf("order of Hooks")>=0)return true;
if(m.indexOf("Should have a queue")>=0)return true;
if(m.indexOf("invalid-hook-call")>=0)return true;
if(m.indexOf("Maximum update depth exceeded")>=0)return true;
if(m.indexOf("Component is not a function")>=0)return true;
if(m.indexOf("ReferenceError")<0)return false;
return m.indexOf(" is not defined")>=0;
}
function reload(){
var n=parseInt(sessionStorage.getItem(KEY)||"0",10);
if(n>=MAX)return;
sessionStorage.setItem(KEY,String(n+1));
var u=new URL(window.location.href);
u.searchParams.set("__qa_recover",String(Date.now()));
window.location.replace(u.toString());
}
window.__qaScheduleRecoverReload=function(){reload();};
window.addEventListener("error",function(ev){
if(fault(ev.message||""))reload();
},{capture:true});
}catch(e){}})();`;

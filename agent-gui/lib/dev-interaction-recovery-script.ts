/**
 * Inline dev recovery — reload before React when HMR leaves onClick handlers dead.
 * Native <a href> still works; React onClick does not.
 */
export const DEV_INTERACTION_RECOVERY_SCRIPT = `(function(){try{
var KEY="qa-react-hooks-recovery-count";
var MAX=3;
function refreshTransient(m,s){
if(s&&(s.indexOf("performReactRefresh")>=0||s.indexOf("react-refresh-runtime")>=0||s.indexOf("@next/react-refresh-utils")>=0))return true;
return false;
}
function fault(m,s){
if(!m)return false;
if(refreshTransient(m,s||""))return false;
if(m.indexOf("order of Hooks")>=0)return true;
if(m.indexOf("Should have a queue")>=0)return true;
if(m.indexOf("invalid-hook-call")>=0)return true;
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
var stack=ev.error&&ev.error.stack?String(ev.error.stack):"";
if(fault(ev.message||"",stack))reload();
},{capture:true});
if(window.location.search.indexOf("__qa_recover=")>=0){
sessionStorage.removeItem(KEY);
}
}catch(e){}})();`;

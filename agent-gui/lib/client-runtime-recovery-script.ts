/**
 * Inline recovery for stale JS chunks after HMR / app update while a tab stays open.
 */
export const CLIENT_RUNTIME_RECOVERY_SCRIPT = `(function(){try{
var KEY="qa-chunk-recovery-count";
var MAX=2;
function isChunkFault(m){
if(!m)return false;
m=String(m);
return m.indexOf("Loading chunk")>=0
||m.indexOf("ChunkLoadError")>=0
||m.indexOf("Failed to fetch dynamically imported module")>=0
||m.indexOf("Importing a module script failed")>=0;
}
function reload(){
var n=parseInt(sessionStorage.getItem(KEY)||"0",10);
if(n>=MAX)return;
sessionStorage.setItem(KEY,String(n+1));
var u=new URL(window.location.href);
u.searchParams.set("__qa_chunk_recover",String(Date.now()));
window.location.replace(u.toString());
}
window.addEventListener("error",function(ev){
if(isChunkFault(ev.message||""))reload();
},{capture:true});
window.addEventListener("unhandledrejection",function(ev){
var reason=ev.reason;
var msg=reason&&reason.message?String(reason.message):String(reason||"");
if(isChunkFault(msg))reload();
});
if(window.location.search.indexOf("__qa_chunk_recover=")>=0){
sessionStorage.removeItem(KEY);
}
}catch(e){}})();`;

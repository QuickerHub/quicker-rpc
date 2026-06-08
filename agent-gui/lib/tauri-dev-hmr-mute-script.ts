/**
 * Mute Next webpack HMR inside Tauri WebView2 without breaking the client bundle.
 * Must run early (before the HMR WebSocket connects).
 */
export const TAURI_DEV_HMR_MUTE_SCRIPT = `(function(){try{
if(!("__TAURI_INTERNALS__"in window||"__TAURI__"in window))return;
var OrigWS=window.WebSocket;
if(!OrigWS||OrigWS.__qaTauriMuted)return;
function isHmrUrl(url){
return typeof url==="string"&&(url.indexOf("webpack-hmr")>=0||url.indexOf("_next/webpack")>=0);
}
function noopSocket(){
var s={readyState:3,bufferedAmount:0,extensions:"",protocol:"",url:""};
s.close=function(){};s.send=function(){};s.addEventListener=function(){};s.removeEventListener=function(){};
return s;
}
window.WebSocket=function(url,protocols){
if(isHmrUrl(url))return noopSocket();
return protocols!==undefined?new OrigWS(url,protocols):new OrigWS(url);
};
window.WebSocket.prototype=OrigWS.prototype;
window.WebSocket.__qaTauriMuted=true;
function declineHot(){
try{if(typeof module!=="undefined"&&module.hot)module.hot.decline();}catch(e){}
}
declineHot();
window.addEventListener("load",declineHot,{once:true});
}catch(e){}})();`;

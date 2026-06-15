/** Server-rendered boot splash — visible before React hydrates. */
export const APP_BOOTSTRAP_SPLASH_MARKUP = `
<div id="app-bootstrap-splash" class="app-loading-indicator app-loading-indicator--fullscreen app-bootstrap-splash" role="status" aria-live="polite" aria-busy="true">
  <div class="app-loading-indicator__bg" aria-hidden="true">
    <div class="app-loading-indicator__mesh"></div>
    <div class="app-loading-indicator__glow"></div>
    <div class="app-loading-indicator__grid"></div>
    <div class="app-loading-indicator__particles">
      <span class="app-loading-indicator__particle app-loading-indicator__particle--1"></span>
      <span class="app-loading-indicator__particle app-loading-indicator__particle--2"></span>
      <span class="app-loading-indicator__particle app-loading-indicator__particle--3"></span>
      <span class="app-loading-indicator__particle app-loading-indicator__particle--4"></span>
      <span class="app-loading-indicator__particle app-loading-indicator__particle--5"></span>
      <span class="app-loading-indicator__particle app-loading-indicator__particle--6"></span>
    </div>
  </div>
  <div class="app-loading-indicator__content">
    <div class="app-loading-indicator__logo-wrap" aria-hidden="true">
      <div class="app-loading-indicator__orbit app-loading-indicator__orbit--a"></div>
      <div class="app-loading-indicator__orbit app-loading-indicator__orbit--b"></div>
      <div class="app-loading-indicator__ring"></div>
      <div class="app-loading-indicator__scan"></div>
      <svg class="app-loading-indicator__mark" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(128, 128)">
          <polygon
            class="app-loading-indicator__mark-hex"
            points="-77.94,-45 -77.94,45 0,90 77.94,45 77.94,-45 0,-90"
            fill="none"
            stroke="currentColor"
            stroke-width="18"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <line class="app-loading-indicator__mark-spoke" x1="0" y1="0" x2="-77.94" y2="-45" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
          <line class="app-loading-indicator__mark-spoke" x1="0" y1="0" x2="0" y2="90" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
          <line class="app-loading-indicator__mark-spoke" x1="0" y1="0" x2="77.94" y2="-45" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
        </g>
      </svg>
    </div>
    <p class="app-loading-indicator__brand"><span class="app-loading-indicator__brand-text">QuickerAgent</span></p>
    <p class="app-loading-indicator__message startup-message">
      <span class="app-loading-indicator__message-text">正在加载界面…</span>
      <span class="app-loading-indicator__dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
    </p>
    <div class="app-loading-indicator__bar" aria-hidden="true">
      <div class="app-loading-indicator__bar-fill"></div>
    </div>
  </div>
</div>
`.trim();

/** Skip splash on /launcher before first paint. */
export const APP_BOOTSTRAP_SPLASH_INIT_SCRIPT = `(function(){try{var p=location.pathname;var q=new URLSearchParams(location.search);if(p==="/launcher"||q.get("embed")==="action-designer")document.documentElement.dataset.appBootSkip="1";}catch(e){}})();`;

/**
 * Inline dismiss — does not wait for React (usePathname can suspend RootLayoutExtras).
 * Also watches for .app-shell / .launcher-route-shell and forces dismiss after timeout.
 */
export const APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT = `(function(){function boot(){try{
var ID="app-bootstrap-splash";
var FADE=320;
var MIN=80;
var MAX=6000;
var t0=performance.now();
var done=false;
function dismiss(force){
if(done)return;
var el=document.getElementById(ID);
if(!el){done=true;document.documentElement.dataset.appReady="1";return;}
done=true;
el.style.pointerEvents="none";
document.documentElement.dataset.appReady="1";
var wait=force?0:Math.max(0,MIN-(performance.now()-t0));
setTimeout(function(){
el.classList.add("app-bootstrap-splash--fade");
setTimeout(function(){el.remove();},FADE);
},wait);
}
window.__dismissAppBootstrapSplash=function(){dismiss(false);};
if(document.documentElement.dataset.appBootSkip==="1"){dismiss(true);return;}
function ready(){
return document.querySelector(".app-shell,.launcher-route-shell");
}
function watch(){
if(ready()){dismiss(false);return;}
var obs=new MutationObserver(function(){
if(ready()){obs.disconnect();dismiss(false);}
});
var root=document.body||document.documentElement;
obs.observe(root,{childList:true,subtree:true});
setTimeout(function(){obs.disconnect();dismiss(false);},MAX);
}
if(document.body){watch();}
else{document.addEventListener("DOMContentLoaded",watch,{once:true});}
}catch(e){}}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",boot,{once:true});}
else{boot();}})();`;

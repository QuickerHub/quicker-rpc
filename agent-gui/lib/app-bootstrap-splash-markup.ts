/** Server-rendered boot splash — visible before React hydrates. */
export const APP_BOOTSTRAP_SPLASH_MARKUP = `
<div id="app-bootstrap-splash" class="app-bootstrap-splash" role="status" aria-live="polite" aria-busy="true">
  <div class="app-bootstrap-splash__bg" aria-hidden="true">
    <div class="app-bootstrap-splash__mesh"></div>
    <div class="app-bootstrap-splash__glow"></div>
    <div class="app-bootstrap-splash__grid"></div>
  </div>
  <div class="app-bootstrap-splash__content">
    <div class="app-bootstrap-splash__logo-wrap" aria-hidden="true">
      <div class="app-bootstrap-splash__orbit app-bootstrap-splash__orbit--a"></div>
      <div class="app-bootstrap-splash__orbit app-bootstrap-splash__orbit--b"></div>
      <div class="app-bootstrap-splash__ring"></div>
      <svg class="app-bootstrap-splash__mark" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(128, 128)">
          <polygon
            points="-77.94,-45 -77.94,45 0,90 77.94,45 77.94,-45 0,-90"
            fill="none"
            stroke="currentColor"
            stroke-width="18"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <line x1="0" y1="0" x2="-77.94" y2="-45" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
          <line x1="0" y1="0" x2="0" y2="90" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
          <line x1="0" y1="0" x2="77.94" y2="-45" stroke="currentColor" stroke-width="18" stroke-linecap="round" />
        </g>
      </svg>
    </div>
    <p class="app-bootstrap-splash__brand">QuickerAgent</p>
    <p class="app-bootstrap-splash__message startup-message">正在加载界面…</p>
    <div class="app-bootstrap-splash__bar" aria-hidden="true">
      <div class="app-bootstrap-splash__bar-fill"></div>
    </div>
  </div>
</div>
`.trim();

/** Skip splash on /launcher before first paint. */
export const APP_BOOTSTRAP_SPLASH_INIT_SCRIPT = `(function(){try{if(location.pathname==="/launcher")document.documentElement.dataset.appBootSkip="1";}catch(e){}})();`;

/**
 * Inline dismiss — does not wait for React (usePathname can suspend RootLayoutExtras).
 * Also watches for .app-shell / .launcher-route-shell and forces dismiss after timeout.
 */
export const APP_BOOTSTRAP_SPLASH_DISMISS_SCRIPT = `(function(){try{
var ID="app-bootstrap-splash";
var FADE=480;
var MIN=420;
var MAX=12000;
var t0=performance.now();
var done=false;
function dismiss(force){
if(done)return;
var el=document.getElementById(ID);
if(!el)return;
done=true;
var wait=force?0:Math.max(0,MIN-(performance.now()-t0));
setTimeout(function(){
el.classList.add("app-bootstrap-splash--fade");
document.documentElement.dataset.appReady="1";
setTimeout(function(){el.remove();},FADE);
},wait);
}
window.__dismissAppBootstrapSplash=function(){dismiss(false);};
if(document.documentElement.dataset.appBootSkip==="1"){dismiss(true);return;}
function ready(){
return document.querySelector(".app-shell,.launcher-route-shell");
}
if(ready()){dismiss(false);return;}
var obs=new MutationObserver(function(){
if(ready()){obs.disconnect();dismiss(false);}
});
if(document.body){obs.observe(document.body,{childList:true,subtree:true});}
setTimeout(function(){obs.disconnect();dismiss(false);},MAX);
}catch(e){}})();`;

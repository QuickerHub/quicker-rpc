/**
 * When /api/icons/fa-vector fails, show a bundled filled (solid-style) MDI glyph.
 * Parses Quicker fa: strings: fa:Solid_Name, fa:Light_Name:#rgb, etc.
 */

/** Normalized base key, e.g. "windowmaximize", "plus", "codebranch". */
export function parseFaQuickerIconBaseKey(spec: string): string {
  const t = spec.trim();
  if (t.length < 4 || !t.toLowerCase().startsWith("fa:")) {
    return "";
  }
  let rest = t.slice(3).trim();
  const segments = rest.split(":").filter((p) => p.length > 0 && !/^#[\da-f]{3,8}$/i.test(p));
  rest = segments.join(":") || rest;
  const m = rest.match(/^(Solid|Light|Regular|Duotone|Thin|Brands)_(.+)$/i);
  const tail = m ? m[2]! : rest;
  return tail.replace(/_/g, "").toLowerCase();
}

/**
 * Maps FA-style icon tail to bundled Iconify icon id (mdi:…).
 * Extend when new toolbox / step icons appear often; unknown → puzzle.
 */
const FA_BASE_TO_MDI: Record<string, string> = {
  plus: "mdi:plus",
  bars: "mdi:menu",
  cog: "mdi:cog",
  gear: "mdi:cog",
  keyboard: "mdi:keyboard",
  windowmaximize: "mdi:window-maximize",
  windowrestore: "mdi:window-restore",
  form: "mdi:form-select",
  input: "mdi:form-textbox",
  textbox: "mdi:form-textbox",
  edit: "mdi:pencil-box-outline",
  listdropdown: "mdi:form-dropdown",
  squarepen: "mdi:square-edit-outline",
  font: "mdi:format-font",
  clipboard: "mdi:clipboard-outline",
  folder: "mdi:folder-outline",
  desktop: "mdi:monitor",
  calculator: "mdi:calculator",
  codebranch: "mdi:source-branch",
  table: "mdi:table",
  trash: "mdi:delete-outline",
  broom: "mdi:broom",
  filter: "mdi:filter",
  arrowsaltv: "mdi:swap-vertical",
  list: "mdi:format-list-bulleted",
  listol: "mdi:format-list-numbered",
  file: "mdi:file-document-outline",
  filelines: "mdi:file-document-outline",
  magnifyingglass: "mdi:magnify",
  search: "mdi:magnify",
  play: "mdi:play",
  stop: "mdi:stop",
  check: "mdi:check",
  times: "mdi:close",
  xmark: "mdi:close",
  question: "mdi:help-circle-outline",
  circlequestion: "mdi:help-circle-outline",
  wrench: "mdi:wrench",
  code: "mdi:code-tags",
  csscript: "mdi:language-csharp",
  runscript: "mdi:console",
  terminal: "mdi:console",
  clock: "mdi:clock-outline",
  calendar: "mdi:calendar",
  envelope: "mdi:email-outline",
  user: "mdi:account",
  users: "mdi:account-group",
  house: "mdi:home",
  globe: "mdi:web",
  cloud: "mdi:cloud-outline",
  database: "mdi:database-outline",
  server: "mdi:server",
  image: "mdi:image-outline",
  link: "mdi:link-variant",
  chain: "mdi:link-variant",
  download: "mdi:download",
  upload: "mdi:upload",
  sync: "mdi:sync",
  save: "mdi:content-save-outline",
  floppy: "mdi:content-save-outline",
  pen: "mdi:pencil",
  pencil: "mdi:pencil",
  eye: "mdi:eye-outline",
  key: "mdi:key-outline",
  shield: "mdi:shield-lock",
  shieldlock: "mdi:shield-lock",
  lock: "mdi:lock",
  bolt: "mdi:lightning-bolt",
  star: "mdi:star",
  chartline: "mdi:chart-line",
  sliders: "mdi:tune-variant",
  diagramproject: "mdi:sitemap-outline",
  projectdiagram: "mdi:sitemap-outline",
  cubes: "mdi:cube-outline",
  box: "mdi:package-variant",
  cartshopping: "mdi:cart-outline",
  creditcard: "mdi:credit-card-outline",
  copy: "mdi:content-copy",
  paste: "mdi:content-paste",
  cut: "mdi:content-cut",
  undo: "mdi:undo",
  redo: "mdi:redo",
  rotate: "mdi:rotate-right",
  mobile: "mdi:cellphone",
  laptop: "mdi:laptop",
  print: "mdi:printer",
  camera: "mdi:camera",
  video: "mdi:video-outline",
  music: "mdi:music-note",
  volume: "mdi:volume-high",
  map: "mdi:map-outline",
  location: "mdi:map-marker",
  truck: "mdi:truck-delivery-outline",
  percent: "mdi:percent",
  at: "mdi:at",
  bug: "mdi:bug-outline",
  flask: "mdi:flask",
  wand: "mdi:auto-fix",
  fire: "mdi:fire",
  heart: "mdi:heart",
  comment: "mdi:comment-outline",
  message: "mdi:message-outline",
  paperplane: "mdi:send",
  droplet: "mdi:water",
  palette: "mdi:palette",
  brush: "mdi:brush",
  eraser: "mdi:eraser",
  hammer: "mdi:hammer-wrench",
  microchip: "mdi:chip",
  tablet: "mdi:tablet",
  moneybill: "mdi:cash",
  slidersh: "mdi:tune-vertical",
  chartbar: "mdi:chart-bar",
  layergroup: "mdi:layers-outline",
  circle: "mdi:circle-outline",
  pause: "mdi:pause",
  eyeslash: "mdi:eye-off-outline",
  unlock: "mdi:lock-open-variant",
  fingerprint: "mdi:fingerprint",
  shieldhalved: "mdi:shield-half-full",
  highlighter: "mdi:marker"
};

export function faVectorSpecToBundledIconifyId(spec: string): string {
  const k = parseFaQuickerIconBaseKey(spec);
  if (!k) {
    return "mdi:puzzle-outline";
  }
  return FA_BASE_TO_MDI[k] ?? "mdi:puzzle-outline";
}

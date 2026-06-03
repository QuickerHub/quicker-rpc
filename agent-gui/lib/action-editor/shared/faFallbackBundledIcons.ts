/**
 * Bundled MDI icons used only as /api/icons/fa-vector failure fallbacks (filled style).
 * Kept separate from toolbar Iconify picks to avoid a single huge actionDesignerIconify file.
 */
import type { IconifyIcon } from "@iconify/types";
import account from "@iconify/icons-mdi/account";
import accountGroup from "@iconify/icons-mdi/account-group";
import at from "@iconify/icons-mdi/at";
import autoFix from "@iconify/icons-mdi/auto-fix";
import brush from "@iconify/icons-mdi/brush";
import bugOutline from "@iconify/icons-mdi/bug-outline";
import calculator from "@iconify/icons-mdi/calculator";
import calendar from "@iconify/icons-mdi/calendar";
import camera from "@iconify/icons-mdi/camera";
import cartOutline from "@iconify/icons-mdi/cart-outline";
import cash from "@iconify/icons-mdi/cash";
import cellphone from "@iconify/icons-mdi/cellphone";
import chartBar from "@iconify/icons-mdi/chart-bar";
import chartLine from "@iconify/icons-mdi/chart-line";
import check from "@iconify/icons-mdi/check";
import chip from "@iconify/icons-mdi/chip";
import circleOutline from "@iconify/icons-mdi/circle-outline";
import clipboardOutline from "@iconify/icons-mdi/clipboard-outline";
import clockOutline from "@iconify/icons-mdi/clock-outline";
import close from "@iconify/icons-mdi/close";
import cloudOutline from "@iconify/icons-mdi/cloud-outline";
import codeTags from "@iconify/icons-mdi/code-tags";
import cog from "@iconify/icons-mdi/cog";
import commentOutline from "@iconify/icons-mdi/comment-outline";
import console from "@iconify/icons-mdi/console";
import contentCopy from "@iconify/icons-mdi/content-copy";
import contentCut from "@iconify/icons-mdi/content-cut";
import contentPaste from "@iconify/icons-mdi/content-paste";
import contentSaveOutline from "@iconify/icons-mdi/content-save-outline";
import creditCardOutline from "@iconify/icons-mdi/credit-card-outline";
import cubeOutline from "@iconify/icons-mdi/cube-outline";
import databaseOutline from "@iconify/icons-mdi/database-outline";
import emailOutline from "@iconify/icons-mdi/email-outline";
import eraser from "@iconify/icons-mdi/eraser";
import eyeOffOutline from "@iconify/icons-mdi/eye-off-outline";
import eyeOutline from "@iconify/icons-mdi/eye-outline";
import fileDocumentOutline from "@iconify/icons-mdi/file-document-outline";
import fingerprint from "@iconify/icons-mdi/fingerprint";
import fire from "@iconify/icons-mdi/fire";
import flask from "@iconify/icons-mdi/flask";
import folderOutline from "@iconify/icons-mdi/folder-outline";
import formatFont from "@iconify/icons-mdi/format-font";
import formatListBulleted from "@iconify/icons-mdi/format-list-bulleted";
import formatListNumbered from "@iconify/icons-mdi/format-list-numbered";
import hammerWrench from "@iconify/icons-mdi/hammer-wrench";
import heart from "@iconify/icons-mdi/heart";
import helpCircleOutline from "@iconify/icons-mdi/help-circle-outline";
import home from "@iconify/icons-mdi/home";
import imageOutline from "@iconify/icons-mdi/image-outline";
import keyboard from "@iconify/icons-mdi/keyboard";
import keyOutline from "@iconify/icons-mdi/key-outline";
import laptop from "@iconify/icons-mdi/laptop";
import lightningBolt from "@iconify/icons-mdi/lightning-bolt";
import linkVariant from "@iconify/icons-mdi/link-variant";
import lock from "@iconify/icons-mdi/lock";
import lockOpenVariant from "@iconify/icons-mdi/lock-open-variant";
import magnify from "@iconify/icons-mdi/magnify";
import mapMarker from "@iconify/icons-mdi/map-marker";
import mapOutline from "@iconify/icons-mdi/map-outline";
import marker from "@iconify/icons-mdi/marker";
import menu from "@iconify/icons-mdi/menu";
import messageOutline from "@iconify/icons-mdi/message-outline";
import monitor from "@iconify/icons-mdi/monitor";
import musicNote from "@iconify/icons-mdi/music-note";
import packageVariant from "@iconify/icons-mdi/package-variant";
import palette from "@iconify/icons-mdi/palette";
import pause from "@iconify/icons-mdi/pause";
import pencil from "@iconify/icons-mdi/pencil";
import percent from "@iconify/icons-mdi/percent";
import play from "@iconify/icons-mdi/play";
import printer from "@iconify/icons-mdi/printer";
import puzzleOutline from "@iconify/icons-mdi/puzzle-outline";
import redo from "@iconify/icons-mdi/redo";
import rotateRight from "@iconify/icons-mdi/rotate-right";
import send from "@iconify/icons-mdi/send";
import server from "@iconify/icons-mdi/server";
import shieldHalfFull from "@iconify/icons-mdi/shield-half-full";
import sitemapOutline from "@iconify/icons-mdi/sitemap-outline";
import sourceBranch from "@iconify/icons-mdi/source-branch";
import star from "@iconify/icons-mdi/star";
import stop from "@iconify/icons-mdi/stop";
import sync from "@iconify/icons-mdi/sync";
import table from "@iconify/icons-mdi/table";
import tablet from "@iconify/icons-mdi/tablet";
import truckDeliveryOutline from "@iconify/icons-mdi/truck-delivery-outline";
import tuneVariant from "@iconify/icons-mdi/tune-variant";
import tuneVertical from "@iconify/icons-mdi/tune-vertical";
import undo from "@iconify/icons-mdi/undo";
import videoOutline from "@iconify/icons-mdi/video-outline";
import volumeHigh from "@iconify/icons-mdi/volume-high";
import water from "@iconify/icons-mdi/water";
import web from "@iconify/icons-mdi/web";
import windowMaximize from "@iconify/icons-mdi/window-maximize";
import wrench from "@iconify/icons-mdi/wrench";
import formDropdown from "@iconify/icons-mdi/form-dropdown";
import formSelect from "@iconify/icons-mdi/form-select";
import formTextbox from "@iconify/icons-mdi/form-textbox";
import languageCsharp from "@iconify/icons-mdi/language-csharp";
import pencilBoxOutline from "@iconify/icons-mdi/pencil-box-outline";
import playBoxOutline from "@iconify/icons-mdi/play-box-outline";
import repeat from "@iconify/icons-mdi/repeat";
import squareEditOutline from "@iconify/icons-mdi/square-edit-outline";
import textBoxOutline from "@iconify/icons-mdi/text-box-outline";
import windowRestore from "@iconify/icons-mdi/window-restore";
import layersOutline from "@iconify/icons-mdi/layers-outline";

export const FA_FALLBACK_BUNDLED_ICONS: Record<string, IconifyIcon> = {
  "mdi:account": account,
  "mdi:account-group": accountGroup,
  "mdi:at": at,
  "mdi:auto-fix": autoFix,
  "mdi:brush": brush,
  "mdi:bug-outline": bugOutline,
  "mdi:calculator": calculator,
  "mdi:calendar": calendar,
  "mdi:camera": camera,
  "mdi:cart-outline": cartOutline,
  "mdi:cash": cash,
  "mdi:cellphone": cellphone,
  "mdi:chart-bar": chartBar,
  "mdi:chart-line": chartLine,
  "mdi:check": check,
  "mdi:chip": chip,
  "mdi:circle-outline": circleOutline,
  "mdi:clipboard-outline": clipboardOutline,
  "mdi:clock-outline": clockOutline,
  "mdi:close": close,
  "mdi:cloud-outline": cloudOutline,
  "mdi:code-tags": codeTags,
  "mdi:cog": cog,
  "mdi:comment-outline": commentOutline,
  "mdi:console": console,
  "mdi:content-copy": contentCopy,
  "mdi:content-cut": contentCut,
  "mdi:content-paste": contentPaste,
  "mdi:content-save-outline": contentSaveOutline,
  "mdi:credit-card-outline": creditCardOutline,
  "mdi:cube-outline": cubeOutline,
  "mdi:database-outline": databaseOutline,
  "mdi:email-outline": emailOutline,
  "mdi:eraser": eraser,
  "mdi:eye-off-outline": eyeOffOutline,
  "mdi:eye-outline": eyeOutline,
  "mdi:file-document-outline": fileDocumentOutline,
  "mdi:fingerprint": fingerprint,
  "mdi:fire": fire,
  "mdi:flask": flask,
  "mdi:folder-outline": folderOutline,
  "mdi:form-dropdown": formDropdown,
  "mdi:form-select": formSelect,
  "mdi:form-textbox": formTextbox,
  "mdi:format-font": formatFont,
  "mdi:format-list-bulleted": formatListBulleted,
  "mdi:format-list-numbered": formatListNumbered,
  "mdi:hammer-wrench": hammerWrench,
  "mdi:heart": heart,
  "mdi:help-circle-outline": helpCircleOutline,
  "mdi:home": home,
  "mdi:image-outline": imageOutline,
  "mdi:keyboard": keyboard,
  "mdi:key-outline": keyOutline,
  "mdi:language-csharp": languageCsharp,
  "mdi:laptop": laptop,
  "mdi:lightning-bolt": lightningBolt,
  "mdi:link-variant": linkVariant,
  "mdi:lock": lock,
  "mdi:lock-open-variant": lockOpenVariant,
  "mdi:magnify": magnify,
  "mdi:map-marker": mapMarker,
  "mdi:map-outline": mapOutline,
  "mdi:marker": marker,
  "mdi:menu": menu,
  "mdi:message-outline": messageOutline,
  "mdi:monitor": monitor,
  "mdi:music-note": musicNote,
  "mdi:package-variant": packageVariant,
  "mdi:palette": palette,
  "mdi:pause": pause,
  "mdi:pencil": pencil,
  "mdi:pencil-box-outline": pencilBoxOutline,
  "mdi:percent": percent,
  "mdi:play": play,
  "mdi:play-box-outline": playBoxOutline,
  "mdi:printer": printer,
  "mdi:puzzle-outline": puzzleOutline,
  "mdi:redo": redo,
  "mdi:repeat": repeat,
  "mdi:rotate-right": rotateRight,
  "mdi:send": send,
  "mdi:server": server,
  "mdi:shield-half-full": shieldHalfFull,
  "mdi:sitemap-outline": sitemapOutline,
  "mdi:source-branch": sourceBranch,
  "mdi:square-edit-outline": squareEditOutline,
  "mdi:star": star,
  "mdi:stop": stop,
  "mdi:sync": sync,
  "mdi:table": table,
  "mdi:tablet": tablet,
  "mdi:text-box-outline": textBoxOutline,
  "mdi:truck-delivery-outline": truckDeliveryOutline,
  "mdi:tune-variant": tuneVariant,
  "mdi:tune-vertical": tuneVertical,
  "mdi:undo": undo,
  "mdi:video-outline": videoOutline,
  "mdi:volume-high": volumeHigh,
  "mdi:water": water,
  "mdi:web": web,
  "mdi:window-maximize": windowMaximize,
  "mdi:window-restore": windowRestore,
  "mdi:wrench": wrench,
  "mdi:layers-outline": layersOutline
};

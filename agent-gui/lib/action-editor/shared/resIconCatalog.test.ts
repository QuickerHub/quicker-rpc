import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeResIconRequestPath,
  resolveResIconSvg,
  resolveResIconToIconifyId,
} from "@/lib/action-editor/shared/resIconCatalog";
import { buildResIconRequestUrl } from "@/lib/action-editor/shared/parseQuickerAssetIcon";
import microsoftWindows from "@iconify/icons-mdi/microsoft-windows";
import { GET } from "@/app/api/icons/res/route";

test("resolveResIconToIconifyId maps Var/text.png", () => {
  assert.equal(resolveResIconToIconifyId("Var/Text.png"), "mdi:format-font");
});

test("buildResIconRequestUrl uses api route", () => {
  const url = buildResIconRequestUrl("Var/Text.png");
  assert.ok(url.startsWith("/api/icons/res?"));
  assert.ok(url.includes("path=Var%2Ftext.png"));
  assert.equal(new URL(url, "http://fixture").searchParams.get("icc"), "5", "Previously cached malformed SVG responses use the retired icc=4 URL");
});

test("normalizeResIconRequestPath rejects traversal", () => {
  assert.equal(normalizeResIconRequestPath("../secret.png"), null);
  assert.equal(normalizeResIconRequestPath("Var/text.png"), "Var/text.png");
});

test("resolveResIconSvg returns svg markup", () => {
  const svg = resolveResIconSvg("Var/text.png");
  assert.ok(svg);
  assert.match(svg!, /<svg/);
});

test("resolveResIconToIconifyId maps Steps/msgbox.png", () => {
  assert.equal(resolveResIconToIconifyId("Steps/msgbox.png"), "mdi:message-alert-outline");
});

test("resolveResIconSvg returns svg for Steps/msgbox.png", () => {
  const svg = resolveResIconSvg("Steps/msgbox.png");
  assert.ok(svg);
  assert.match(svg!, /<svg/);
});

test("resolveResIconToIconifyId falls back for unknown Steps assets", () => {
  assert.equal(resolveResIconToIconifyId("Steps/custom_step.png"), "mdi:play-circle-outline");
});

test("the native windows.png resource has an explicit bundled Windows fallback", () => {
  assert.equal(resolveResIconToIconifyId("windows.png"), "mdi:microsoft-windows");
  assert.equal(resolveResIconToIconifyId("Windows.png"), "mdi:microsoft-windows");
  assert.equal(resolveResIconToIconifyId("unknown-native-logo.png"), null);
});

test("the real resource API returns drawable Windows SVG markup rather than markup in a path attribute", async () => {
  const response = await GET(new Request(new URL(buildResIconRequestUrl("windows.png"), "http://fixture")));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  const svg = await response.text();
  assert.match(svg, /^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 24 24"/);
  assert.match(svg, /width="24" height="24" fill="currentColor"/);
  assert.ok(svg.includes(microsoftWindows.body), "The actual bundled Windows path remains a complete SVG child");
  assert.equal((svg.match(/<svg\b/g) ?? []).length, 1);
  assert.equal((svg.match(/<\/svg>/g) ?? []).length, 1);
  assert.match(svg, /<path\b[^>]*\sd="M[^"<>]+"\s*\/>/);
  assert.doesNotMatch(svg, /\bd="</);
});

test("the real resource API preserves traversal rejection and unknown-resource 404", async () => {
  const unknown = await GET(new Request("http://fixture/api/icons/res?path=unknown-native-logo.png"));
  assert.equal(unknown.status, 404);
  const traversal = await GET(new Request("http://fixture/api/icons/res?path=..%2Fwindows.png"));
  assert.equal(traversal.status, 400);
});

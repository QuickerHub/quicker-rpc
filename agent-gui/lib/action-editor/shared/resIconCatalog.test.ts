import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeResIconRequestPath,
  resolveResIconSvg,
  resolveResIconToIconifyId,
} from "@/lib/action-editor/shared/resIconCatalog";
import { buildResIconRequestUrl } from "@/lib/action-editor/shared/parseQuickerAssetIcon";

test("resolveResIconToIconifyId maps Var/text.png", () => {
  assert.equal(resolveResIconToIconifyId("Var/Text.png"), "mdi:format-font");
});

test("buildResIconRequestUrl uses api route", () => {
  const url = buildResIconRequestUrl("Var/Text.png");
  assert.ok(url.startsWith("/api/icons/res?"));
  assert.ok(url.includes("path=Var%2Ftext.png"));
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

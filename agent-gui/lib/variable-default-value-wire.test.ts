import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compactVariableDefaultWireRecord,
  expandVariableDefaultWireRecord,
} from "@/lib/variable-default-value-wire";

test("expand and compact variable default wire", () => {
  const inline = expandVariableDefaultWireRecord({
    key: "count",
    default: "10",
  });
  assert.equal(inline.defaultValue, "10");

  const file = expandVariableDefaultWireRecord({
    key: "body",
    "default.file": "files/body-default1.txt",
  });
  assert.deepEqual(file.defaultValue, { file: "files/body-default1.txt" });

  const compactInline = compactVariableDefaultWireRecord({
    key: "count",
    defaultValue: "10",
  });
  assert.equal(compactInline.default, "10");
  assert.equal(compactInline.defaultValue, undefined);
  assert.equal(compactInline["default.file"], undefined);

  const compactFile = compactVariableDefaultWireRecord({
    key: "body",
    defaultValue: { file: "files/body-default1.txt" },
  });
  assert.equal(compactFile["default.file"], "files/body-default1.txt");
  assert.equal(compactFile.default, undefined);
  assert.equal(compactFile.defaultValue, undefined);
});

test("legacy defaultValue shapes expand to canonical defaultValue", () => {
  const legacyInline = expandVariableDefaultWireRecord({
    key: "n",
    defaultValue: "99",
  });
  assert.equal(legacyInline.defaultValue, "99");
  assert.equal(legacyInline.default, undefined);

  const legacyFileObject = expandVariableDefaultWireRecord({
    key: "body",
    defaultValue: { file: "files/body-default1.txt" },
  });
  assert.deepEqual(legacyFileObject.defaultValue, { file: "files/body-default1.txt" });

  const legacyWireFile = expandVariableDefaultWireRecord({
    key: "blob",
    "defaultValue.file": "files/blob-default1.txt",
  });
  assert.deepEqual(legacyWireFile.defaultValue, { file: "files/blob-default1.txt" });
  assert.equal(legacyWireFile["defaultValue.file"], undefined);

  const legacyDefaultValueFile = expandVariableDefaultWireRecord({
    key: "urls",
    defaultValueFile: "files/urls-default1.txt",
  });
  assert.deepEqual(legacyDefaultValueFile.defaultValue, { file: "files/urls-default1.txt" });
  assert.equal(legacyDefaultValueFile.defaultValueFile, undefined);
});

test("legacy defaultValue compacts to default / default.file wire", () => {
  assert.equal(
    compactVariableDefaultWireRecord({ key: "a", defaultValue: "hello" }).default,
    "hello",
  );
  assert.equal(
    compactVariableDefaultWireRecord({
      key: "b",
      defaultValue: { file: "files/b.txt" },
    })["default.file"],
    "files/b.txt",
  );
  assert.equal(
    compactVariableDefaultWireRecord({
      key: "c",
      "defaultValue.file": "files/c.txt",
    })["default.file"],
    "files/c.txt",
  );
  assert.equal(
    compactVariableDefaultWireRecord({
      key: "d",
      defaultValueFile: "files/d.txt",
    })["default.file"],
    "files/d.txt",
  );
});

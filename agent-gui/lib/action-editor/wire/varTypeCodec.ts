import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";

const STRING_TO_NUM: Record<string, number> = {
  text: CsVarType.Text,
  number: CsVarType.Number,
  boolean: CsVarType.Boolean,
  image: CsVarType.Image,
  list: CsVarType.List,
  datetime: CsVarType.DateTime,
  keyboard: CsVarType.Keyboard,
  mouse: CsVarType.Mouse,
  enum: CsVarType.Enum,
  dict: CsVarType.Dict,
  form: CsVarType.Form,
  integer: CsVarType.Integer,
  table: CsVarType.Table,
  formfordict: CsVarType.FormForDict,
  object: CsVarType.Object,
  any: CsVarType.Any,
};

const NUM_TO_STRING: Partial<Record<number, string>> = {
  [CsVarType.Text]: "text",
  [CsVarType.Number]: "number",
  [CsVarType.Boolean]: "boolean",
  [CsVarType.Image]: "image",
  [CsVarType.List]: "list",
  [CsVarType.DateTime]: "datetime",
  [CsVarType.Keyboard]: "keyboard",
  [CsVarType.Mouse]: "mouse",
  [CsVarType.Enum]: "enum",
  [CsVarType.Dict]: "dict",
  [CsVarType.Form]: "form",
  [CsVarType.Integer]: "integer",
  [CsVarType.Table]: "table",
  [CsVarType.FormForDict]: "formfordict",
  [CsVarType.Object]: "object",
  [CsVarType.Any]: "any",
};

export function wireVarTypeToEditor(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const key = raw.trim().toLowerCase();
    if (key in STRING_TO_NUM) {
      return STRING_TO_NUM[key]!;
    }
  }
  return CsVarType.Text;
}

export function editorVarTypeToWire(varType: number): string | undefined {
  const mapped = NUM_TO_STRING[varType];
  if (!mapped || mapped === "text") {
    return undefined;
  }
  return mapped;
}

import { CsVarType } from "./csStepEnums";

/** Mirrors Quicker VariableHelper.IsAssignable for step param variable picking. */
export function isStepParamVarAssignable(fromType: number, toType: number): boolean {
  if (fromType === CsVarType.Any || toType === CsVarType.Any) {
    return true;
  }
  if (
    (fromType === CsVarType.Integer && toType === CsVarType.Number) ||
    (fromType === CsVarType.Number && toType === CsVarType.Integer)
  ) {
    return true;
  }
  if (toType === CsVarType.Text) {
    return fromType !== CsVarType.Image;
  }
  if (toType === CsVarType.Enum) {
    return fromType === CsVarType.Text;
  }
  if (toType === CsVarType.List) {
    return fromType === CsVarType.Text || fromType === CsVarType.Any || fromType === CsVarType.List;
  }
  if (toType === CsVarType.Object) {
    return (
      fromType === CsVarType.Object ||
      fromType === CsVarType.Any ||
      fromType === CsVarType.Table ||
      fromType === CsVarType.Image
    );
  }
  return toType === fromType;
}

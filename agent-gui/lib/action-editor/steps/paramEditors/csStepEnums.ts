/**
 * Mirrors Quicker.Public.Actions.VarType (int values from backend).
 */
export const CsVarType = {
  Text: 0,
  Number: 1,
  Boolean: 2,
  Image: 3,
  List: 4,
  DateTime: 6,
  Keyboard: 7,
  Mouse: 8,
  Enum: 9,
  Dict: 10,
  Form: 11,
  Integer: 12,
  Table: 13,
  FormForDict: 14,
  Object: 98,
  Any: 99,
  NA: 100,
  CreateVar: 101
} as const;

/**
 * Mirrors Quicker.Domain.Actions.X.StepRunners.ParamVariableMode.
 * UseVar (2) is treated the same as UseVarOnly in web param editors.
 */
export const ParamVariableMode = {
  UseVarOrInput: 0,
  Input: 1,
  UseVar: 2,
  UseVarOnly: 3
} as const;

using System;
using System.Collections.Generic;
using System.Dynamic;
using System.Linq;
using System.Text.RegularExpressions;
using Quicker.Domain.Actions;
using Quicker.Domain.Actions.X;
using Quicker.Domain.Actions.X.StepRunners;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Public.Actions;
using Quicker.Utilities;
using Z.Expressions;

namespace QuickerRpc.Plugin.StepRunners;

/// <summary>
/// Plugin-provided <c>sys:evalexpression</c> step runner (backfill when Quicker build lacks it).
/// Logic aligned with Quicker <c>EvalExpressionStepV2</c>.
/// </summary>
internal sealed class EvalExpressionStepRunner : IStepRunner
{
    public const string StepKey = "sys:evalexpression";

    private static readonly StepInParamDef ExpressionParam = new()
    {
        Key = "expression",
        Name = "表达式",
        Description = "要执行的C#表达式或脚本代码，支持使用{变量名}和上下文对象。可以以$=开头。支持 {varname}=value 赋值语法。",
        DefaultValue = "",
        Type = VarType.Text,
        IsRequired = true,
        IsMultiLine = true,
        VariableMode = ParamVariableMode.Input,
        SkipEval = true,
    };

    private static readonly StepInParamDef OnUiThreadParam = new()
    {
        Key = "onUiThread",
        Name = "在UI线程执行",
        Description = "是否在UI线程上执行表达式。谨慎使用，可能造成死锁。",
        DefaultValue = false,
        Type = VarType.Boolean,
        VariableMode = ParamVariableMode.Input,
    };

    private static readonly StepOutParamDef OutputParam = new()
    {
        Key = "output",
        Name = "结果",
        Description = "表达式执行结果",
        Type = VarType.Any,
    };

    private static readonly string[] Keywords =
    {
        "eval", "expression", "表达式", "执行", "脚本", "执行表达式",
    };

    public string Key => StepKey;

    public string Name => "执行表达式";

    public IEnumerable<string> KeyWords => Keywords;

    public string Icon => "fa:Light_Code";

    public StepRunnerCategory Category => StepRunnerCategory.Compute;

    public IEnumerable<StepRunnerCategory> SecondaryCategories => Array.Empty<StepRunnerCategory>();

    public string Description => "执行C#表达式或脚本代码，支持使用变量和上下文对象。";

    public StepType StepType => StepType.Action;

    public string HelpLink => "https://getquicker.net/KC/evalexpression";

    public bool IsRisky => false;

    public bool IsProOnly => false;

    public IList<StepInParamDef> InputParams { get; } = new List<StepInParamDef>
    {
        ExpressionParam,
        OnUiThreadParam,
        StepInParamDef.StopIfFailParam,
    };

    public IList<StepOutParamDef> OutputParams { get; } = new List<StepOutParamDef>
    {
        OutputParam,
        StepOutParamDef.IsSuccessOutputParam,
        StepOutParamDef.ErrorMessageOutputParam,
    };

    public bool ValidateParam(string paramData, out string message)
    {
        message = string.Empty;
        return true;
    }

    public void Execute(ActionStep step, ActionExecuteContext context, XAction action, string _)
    {
        var stopIfFail = XActionHelper.GetBooleanParamValue(StepInParamDef.StopIfFailParam, step, context);
        var isSuccess = false;
        string message = string.Empty;

        try
        {
            isSuccess = TryExecuteCore(step, context, action, out message);
        }
        catch (Exception ex)
        {
            isSuccess = false;
            message = ex.Message;
            context.ActionLogger?.LogError(message, ex);
        }

        XActionHelper.OutputResult(StepOutParamDef.IsSuccessOutputParam, step, context, isSuccess, action);
        if (XActionHelper.IsOutputParamSetted(StepOutParamDef.ErrorMessageOutputParam.Key, step))
        {
            XActionHelper.OutputResult(StepOutParamDef.ErrorMessageOutputParam, step, context, message, action);
        }

        if (isSuccess)
        {
            return;
        }

        context.ActionLogger?.LogWarning($"步骤({step.StepRunnerKey})执行失败，原因：" + message);
        if (stopIfFail)
        {
            context.StopAction(ActionStopFlag.OperationFailed, message);
            context.ErrorMessage = message + $"({step.StepRunnerName})";
        }
    }

    public string GetSummary(ActionStep step) =>
        XActionHelper.GetParamDisplayString(ExpressionParam, step);

    private static bool TryExecuteCore(ActionStep step, ActionExecuteContext context, XAction action, out string message)
    {
        message = string.Empty;
        var expression = XActionHelper.GetTextParamValue(ExpressionParam, step, context);
        if (string.IsNullOrEmpty(expression))
        {
            message = "要执行的表达式为空。";
            return false;
        }

        var onUiThread = XActionHelper.GetBooleanParamValue(OnUiThreadParam, step, context);

        try
        {
            if (expression.StartsWith("$=", StringComparison.Ordinal))
            {
                expression = expression.Substring(2);
            }

            VariableDictionary variableDict = context.IsDebugging
                ? new DebugVariableDictionary(context)
                : new VariableDictionary(context);

            if (expression.IndexOf("{[cliptext]}", StringComparison.Ordinal) >= 0)
            {
                expression = expression.Replace("{[cliptext]}", "vv_cliptext");
                variableDict.SetProperty("vv_cliptext", ClipboardHelper.TryGetClipboardText());
            }

            var varPattern = new Regex(@"{([^}{\s]+)}", RegexOptions.Compiled);
            var processedVars = new HashSet<string>(StringComparer.Ordinal);

            expression = varPattern.Replace(expression, match =>
            {
                var varKey = match.Groups[1].Value;
                var varName = "v_" + varKey;

                if (processedVars.Contains(varKey))
                {
                    return varName;
                }

                processedVars.Add(varKey);

                var value = context.CustomData.TryGetValue(varKey, out var existingValue)
                    ? existingValue
                    : null;

                if (value == null)
                {
                    context.ActionLogger?.LogWarning($"变量 {varKey} 的值为null，可能会造成表达式解析出错。");
                }
                else if (value is long l && l > int.MinValue && l < int.MaxValue)
                {
                    value = (int)l;
                }

                variableDict.SetProperty(varName, value!);
                return varName;
            });

            variableDict.SetProperty("_context", context);

            if (context.IsDebugging)
            {
                var dict = variableDict as VariableDictionary;
                context.ActionLogger?.LogInfo($"变量字典内容: {dict?.GetDebugInfo() ?? "N/A"}");
                context.ActionLogger?.LogInfo($"处理后的表达式: {expression}");
            }

            object? result;
            if (onUiThread)
            {
                object? value = null;
                AppHelper.RunOnUiThread(true, () =>
                {
                    var evalContext = context.GetEvalContext();
                    value = evalContext.Execute(expression, variableDict);
                });
                result = value;
            }
            else
            {
                var evalContext = context.GetEvalContext();
                result = evalContext.Execute(expression, variableDict);
            }

            XActionHelper.OutputResult(OutputParam, step, context, result, action);
            return true;
        }
        catch (Exception ex)
        {
            message = $"表达式执行失败: {ex.Message}";
            context.ActionLogger?.LogError(message, ex);
            return false;
        }
    }

    private class VariableDictionary(ActionExecuteContext context) : DynamicObject
    {
        protected readonly ActionExecuteContext Context = context;
        private readonly Dictionary<string, object?> _properties = new(StringComparer.Ordinal);

        public override bool TryGetMember(GetMemberBinder binder, out object? result) =>
            _properties.TryGetValue(binder.Name, out result);

        public override bool TrySetMember(SetMemberBinder binder, object? value)
        {
            _properties[binder.Name] = value;

            if (binder.Name.StartsWith("v_", StringComparison.Ordinal) && binder.Name.Length > 2)
            {
                var originalVarName = binder.Name.Substring(2);
                Context.CustomData[originalVarName] = value!;
            }

            return true;
        }

        public void SetProperty(string name, object value) => _properties[name] = value;

        public string GetDebugInfo() =>
            string.Join(", ", _properties.Select(kvp => $"{kvp.Key}={kvp.Value}"));
    }

    private sealed class DebugVariableDictionary(ActionExecuteContext context) : VariableDictionary(context)
    {
        public override bool TryGetMember(GetMemberBinder binder, out object? result)
        {
            var success = base.TryGetMember(binder, out result);
            if (!success)
            {
                return false;
            }

            if (binder.Name.StartsWith("v_", StringComparison.Ordinal) && binder.Name.Length > 2)
            {
                var originalVarName = binder.Name.Substring(2);
                Context.ActionLogger?.LogInfo($"[变量读取] {{{originalVarName}}} -> {result}");
            }
            else
            {
                Context.ActionLogger?.LogInfo($"[变量读取] {binder.Name} = {result}");
            }

            return true;
        }

        public override bool TrySetMember(SetMemberBinder binder, object? value)
        {
            var success = base.TrySetMember(binder, value);

            if (binder.Name.StartsWith("v_", StringComparison.Ordinal) && binder.Name.Length > 2)
            {
                var originalVarName = binder.Name.Substring(2);
                Context.ActionLogger?.LogInfo($"[变量写入] {{{originalVarName}}} = {value}");
            }

            return success;
        }
    }
}

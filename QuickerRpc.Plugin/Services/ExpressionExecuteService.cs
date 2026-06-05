using System;
using System.Collections.Generic;
using System.Dynamic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Quicker.Utilities;
using QuickerRpc.Contracts.Rpc;
using Z.Expressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Runs Quicker expressions ($= / sys:evalexpression) via Z.Expressions, aligned with EvalExpressionStepV2.
/// </summary>
public sealed class ExpressionExecuteService
{
    private static readonly Regex VariablePlaceholderPattern = new(@"{([^}{\s]+)}", RegexOptions.Compiled);

    public QuickerRpcExpressionExecuteResult Execute(
        string code,
        string? variablesJson = null,
        bool onUiThread = false)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("EMPTY_CODE", "Expression code is empty.");
        }

        var expression = NormalizeExpression(code);
        var inputVariables = ParseVariablesJson(variablesJson);

        try
        {
            dynamic variableDict = new ExpressionVariableBag(inputVariables);

            if (expression.IndexOf("{[cliptext]}", StringComparison.Ordinal) >= 0)
            {
                expression = expression.Replace("{[cliptext]}", "vv_cliptext");
                variableDict.vv_cliptext = ClipboardHelper.TryGetClipboardText();
            }

            var processedVars = new HashSet<string>(StringComparer.Ordinal);
            expression = VariablePlaceholderPattern.Replace(expression, match =>
            {
                var varKey = match.Groups[1].Value;
                var varName = "v_" + varKey;

                if (processedVars.Contains(varKey))
                {
                    return varName;
                }

                processedVars.Add(varKey);

                if (!inputVariables.TryGetValue(varKey, out var value))
                {
                    value = null;
                }
                else if (value is long l && l > int.MinValue && l < int.MaxValue)
                {
                    value = (int)l;
                }

                ((ExpressionVariableBag)variableDict).SetProperty(varName, value);
                return varName;
            });

            expression = ExpressionEvalTransforms.EnsureTypedSplitAssignment(expression);

            var eval = CreateExpressionEvalContext();
            object? result;
            if (onUiThread)
            {
                object? value = null;
                AppHelper.RunOnUiThread(true, () => value = eval.Execute(expression, variableDict));
                result = value;
            }
            else
            {
                result = eval.Execute(expression, variableDict);
            }

            var bag = (ExpressionVariableBag)variableDict;
            return new QuickerRpcExpressionExecuteResult
            {
                Ok = true,
                Success = true,
                Message = string.Empty,
                ResultJson = SerializeJson(result),
                ResultType = result?.GetType().FullName,
                VariablesJson = SerializeJson(bag.ExportUserVariables()),
            };
        }
        catch (Exception ex)
        {
            return Fail("EXECUTE_ERROR", ex.Message);
        }
    }

    private static string NormalizeExpression(string code)
    {
        var expression = code.Trim();
        if (expression.StartsWith("$=", StringComparison.Ordinal))
        {
            expression = expression.Substring(2).TrimStart();
        }

        return expression;
    }

    private static EvalContext CreateExpressionEvalContext()
    {
        var eval = EvalManager.DefaultContext.Clone();
        eval.UseLocalCache = true;
        return eval;
    }

    private static Dictionary<string, object?> ParseVariablesJson(string? variablesJson)
    {
        if (string.IsNullOrWhiteSpace(variablesJson))
        {
            return new Dictionary<string, object?>(StringComparer.Ordinal);
        }

        var doc = JsonDocument.Parse(variablesJson);
        if (doc.RootElement.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidOperationException("variables must be a JSON object.");
        }

        var map = new Dictionary<string, object?>(StringComparer.Ordinal);
        foreach (var prop in doc.RootElement.EnumerateObject())
        {
            map[prop.Name] = JsonElementToObject(prop.Value);
        }

        return map;
    }

    private static object? JsonElementToObject(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.Null => null,
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number when element.TryGetInt64(out var l) => l,
            JsonValueKind.Number => element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Array => element.EnumerateArray().Select(JsonElementToObject).ToList(),
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(p => p.Name, p => JsonElementToObject(p.Value), StringComparer.Ordinal),
            _ => element.GetRawText(),
        };

    private static string? SerializeJson(object? value)
    {
        if (value is null)
        {
            return null;
        }

        try
        {
            return JsonConvert.SerializeObject(value);
        }
        catch
        {
            return JsonConvert.SerializeObject(value.ToString());
        }
    }

    private static QuickerRpcExpressionExecuteResult Fail(string errorCode, string message) =>
        new()
        {
            Ok = false,
            Success = false,
            ErrorCode = errorCode,
            Message = message,
        };

    private sealed class ExpressionVariableBag : DynamicObject
    {
        private readonly Dictionary<string, object?> _properties = new(StringComparer.Ordinal);
        private readonly Dictionary<string, object?> _userVariables;

        public ExpressionVariableBag(Dictionary<string, object?> seed)
        {
            _userVariables = seed;
            foreach (var pair in seed)
            {
                _properties["v_" + pair.Key] = pair.Value;
            }
        }

        public override bool TryGetMember(GetMemberBinder binder, out object? result) =>
            _properties.TryGetValue(binder.Name, out result);

        public override bool TrySetMember(SetMemberBinder binder, object? value)
        {
            _properties[binder.Name] = value!;

            if (binder.Name.StartsWith("v_", StringComparison.Ordinal) && binder.Name.Length > 2)
            {
                var originalVarName = binder.Name.Substring(2);
                _userVariables[originalVarName] = value;
            }

            return true;
        }

        public void SetProperty(string name, object? value)
        {
            _properties[name] = value!;
            if (name.StartsWith("v_", StringComparison.Ordinal) && name.Length > 2)
            {
                _userVariables[name.Substring(2)] = value;
            }
        }

        public Dictionary<string, object?> ExportUserVariables() => new(_userVariables, StringComparer.Ordinal);
    }
}

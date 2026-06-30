using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Newtonsoft.Json;
using QuickerRpc.Contracts.Rpc;
using Z.Expressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Runs Quicker expressions ($= / sys:evalexpression) via Z.Expressions, aligned with EvalExpressionStepV2.
/// </summary>
public sealed class ExpressionExecuteService
{
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
            var globals = new Dictionary<string, object?>(StringComparer.Ordinal);

            if (expression.IndexOf("{[cliptext]}", StringComparison.Ordinal) >= 0)
            {
                expression = expression.Replace("{[cliptext]}", "vv_cliptext");
                globals["vv_cliptext"] = TryGetClipboardText() ?? string.Empty;
            }

            var definedKeys = new HashSet<string>(inputVariables.Keys, StringComparer.OrdinalIgnoreCase)
            {
                ExpressionVariablePlaceholder.QuickerInParamKey,
            };
            expression = ExpressionVariablePlaceholder.Replace(
                expression,
                definedKeys,
                varKey =>
                {
                    inputVariables.TryGetValue(varKey, out var value);
                    return ExpressionVariableResolver.NormalizeForEvalBinding(value, null);
                },
                (varName, value) => globals[varName] = value);

            expression = ExpressionEvalTransforms.EnsureTypedSplitAssignment(expression);

            var eval = CreateExpressionEvalContext();
            var outputVariables = new Dictionary<string, object?>(inputVariables, StringComparer.Ordinal);
            object? result;
            if (onUiThread)
            {
                object? value = null;
                RunOnUiThread(
                    () => value = ExpressionEvalBinding.Execute(
                        eval,
                        expression,
                        globals,
                        onVariableWritten: (varKey, writtenValue) =>
                            outputVariables[varKey] = writtenValue));
                result = value;
            }
            else
            {
                result = ExpressionEvalBinding.Execute(
                    eval,
                    expression,
                    globals,
                    onVariableWritten: (varKey, writtenValue) =>
                        outputVariables[varKey] = writtenValue);
            }

            return new QuickerRpcExpressionExecuteResult
            {
                Ok = true,
                Success = true,
                Message = string.Empty,
                ResultJson = SerializeJson(result),
                ResultType = result?.GetType().FullName,
                VariablesJson = SerializeJson(outputVariables),
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

    private static void RunOnUiThread(Action action)
    {
        var appHelperType = Type.GetType("Quicker.Utilities.AppHelper, Quicker.Utilities", throwOnError: false)
                            ?? Type.GetType("Quicker.Utilities.AppHelper, Quicker", throwOnError: false);
        var method = appHelperType?.GetMethods()
            .FirstOrDefault(m =>
            {
                if (!string.Equals(m.Name, "RunOnUiThread", StringComparison.Ordinal))
                {
                    return false;
                }

                var parameters = m.GetParameters();
                return parameters.Length >= 2
                       && parameters[0].ParameterType == typeof(bool)
                       && parameters[1].ParameterType == typeof(Action);
            });

        if (method is null)
        {
            action();
            return;
        }

        var parameters = method.GetParameters();
        var args = new object?[parameters.Length];
        args[0] = true;
        args[1] = action;
        for (var i = 2; i < args.Length; i++)
        {
            args[i] = parameters[i].HasDefaultValue
                ? parameters[i].DefaultValue
                : GetDefaultValue(parameters[i].ParameterType);
        }

        method.Invoke(null, args);
    }

    private static string? TryGetClipboardText()
    {
        var clipboardType = Type.GetType("Quicker.Utilities.ClipboardHelper, Quicker.Utilities", throwOnError: false)
                            ?? Type.GetType("Quicker.Utilities.ClipboardHelper, Quicker", throwOnError: false);
        var method = clipboardType?.GetMethod("TryGetClipboardText", Type.EmptyTypes);
        return method?.Invoke(null, Array.Empty<object>()) as string;
    }

    private static object? GetDefaultValue(Type type) =>
        type.IsValueType ? Activator.CreateInstance(type) : null;

    private static QuickerRpcExpressionExecuteResult Fail(string errorCode, string message) =>
        new()
        {
            Ok = false,
            Success = false,
            ErrorCode = errorCode,
            Message = message,
        };

}

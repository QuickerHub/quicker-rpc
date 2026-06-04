using System;
using System.Collections.Generic;
using System.Reflection;
using Quicker.Public;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.StepRunners;
using Z.Expressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Syntax validation for Quicker expressions (Z.Expressions) and C# script steps (Westwind Roslyn).
/// </summary>
public sealed class CodeSyntaxCheckService
{
    public QuickerRpcCodeSyntaxCheckResult CheckExpression(
        string code,
        IDictionary<string, string>? variableTypes = null)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("expression", "EMPTY_CODE", "Expression code is empty.");
        }

        var expression = NormalizeExpression(code);
        try
        {
            var eval = CreateExpressionEvalContext();
            RegisterExpressionVariables(eval);
            var prepared = PrepareExpressionForCompile(eval, expression, variableTypes);
            eval.Compile(prepared);
            return Ok("expression");
        }
        catch (Exception ex)
        {
            return Fail("expression", "COMPILE_ERROR", ex.Message);
        }
    }

    public QuickerRpcCodeSyntaxCheckResult CheckCSharpScript(string code, string? references = null)
    {
        if (string.IsNullOrWhiteSpace(code))
        {
            return Fail("csharp", "EMPTY_CODE", "C# script code is empty.");
        }

        try
        {
            if (!TryCompileCSharpScript(code, references, out var errorMessage, out var errorType))
            {
                var message = string.IsNullOrWhiteSpace(errorMessage)
                    ? "C# script compile failed."
                    : errorMessage!;
                if (!string.IsNullOrWhiteSpace(errorType))
                {
                    message = $"{errorType}: {message}";
                }

                return Fail("csharp", "COMPILE_ERROR", message);
            }

            return Ok("csharp");
        }
        catch (Exception ex)
        {
            return Fail("csharp", "COMPILE_ERROR", ex.Message);
        }
    }

    private static string NormalizeExpression(string code)
    {
        var expression = code.Trim();
        if (expression.StartsWith("$=", StringComparison.Ordinal))
        {
            expression = expression.Substring(2).TrimStart();
        }

        if (expression.IndexOf("{[cliptext]}", StringComparison.Ordinal) >= 0)
        {
            expression = expression.Replace("{[cliptext]}", "vv_cliptext");
        }

        return expression;
    }

    private static EvalContext CreateExpressionEvalContext()
    {
        var eval = EvalManager.DefaultContext.Clone();
        eval.UseLocalCache = true;
        return eval;
    }

    private static void RegisterExpressionVariables(EvalContext eval)
    {
        eval.RegisterGlobalVariable("vv_cliptext", string.Empty);
        eval.RegisterGlobalVariable("quicker_in_param", string.Empty);
    }

    private static object? CreateDummyValue(string? typeName)
    {
        var normalized = (typeName ?? string.Empty).Trim().ToLowerInvariant();
        return normalized switch
        {
            "string" or "text" => string.Empty,
            "int" or "integer" or "number" => 0,
            "long" => 0L,
            "double" or "float" or "decimal" => 0.0,
            "bool" or "boolean" => false,
            _ => new object(),
        };
    }

    private static string PrepareExpressionForCompile(
        EvalContext eval,
        string expression,
        IDictionary<string, string>? variableTypes)
    {
        return EvalExpressionStepRunner.ReplaceVariablePlaceholders(
            expression,
            _ => true,
            key => CreateDummyValue(variableTypes != null && variableTypes.TryGetValue(key, out var t) ? t : null),
            (name, value) => eval.RegisterGlobalVariable(name, value));
    }

    private static bool TryCompileCSharpScript(string code, string? references, out string? errorMessage, out string? errorType)
    {
        errorMessage = null;
        errorType = null;

        var scriptType = FindCSharpScriptExecutionType();
        if (scriptType is null)
        {
            errorMessage = "Westwind.Scripting.CSharpScriptExecution is not available in the current AppDomain.";
            return false;
        }

        var script = Activator.CreateInstance(scriptType);
        if (script is null)
        {
            errorMessage = "Failed to create CSharpScriptExecution instance.";
            return false;
        }

        InvokeInstance(script, "AddDefaultReferencesAndNamespaces");
        InvokeInstance(script, "AddLoadedReferences");
        AddScriptAssembly(script, typeof(IStepContext));

        foreach (var referencePath in SplitReferences(references))
        {
            InvokeInstance(script, "AddAssembly", referencePath);
        }

        var compiled = InvokeCompileAssemblyForExecuteMethod(script, code);
        if (compiled)
        {
            return true;
        }

        errorMessage = ReadInstanceString(script, "ErrorMessage");
        errorType = ReadInstanceString(script, "ErrorType");
        var generated = ReadInstanceString(script, "GeneratedClassCodeWithLineNumbers");
        if (!string.IsNullOrWhiteSpace(generated))
        {
            errorMessage = string.IsNullOrWhiteSpace(errorMessage)
                ? generated
                : errorMessage + Environment.NewLine + generated;
        }

        return false;
    }

    private static Type? FindCSharpScriptExecutionType()
    {
        const string typeName = "Westwind.Scripting.CSharpScriptExecution";
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                var type = assembly.GetType(typeName, throwOnError: false, ignoreCase: false);
                if (type is not null)
                {
                    return type;
                }
            }
            catch
            {
                // ignore dynamic/reflection-only assemblies
            }
        }

        return Type.GetType(typeName + ", Quicker", throwOnError: false, ignoreCase: false)
               ?? Type.GetType(typeName + ", Quicker.3rd", throwOnError: false, ignoreCase: false);
    }

    private static IEnumerable<string> SplitReferences(string? references)
    {
        if (string.IsNullOrWhiteSpace(references))
        {
            yield break;
        }

        foreach (var line in references.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith("//", StringComparison.Ordinal))
            {
                continue;
            }

            yield return trimmed.TrimEnd(';');
        }
    }

    private static void AddScriptAssembly(object script, Type type)
    {
        var method = script.GetType().GetMethod("AddAssembly", new[] { typeof(Type) });
        method?.Invoke(script, new object[] { type });
    }

    private static void InvokeInstance(object target, string methodName, params object[] args)
    {
        var types = Array.ConvertAll(args, a => a?.GetType() ?? typeof(object));
        var method = target.GetType().GetMethod(methodName, types);
        if (method is null)
        {
            method = target.GetType().GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);
        }

        method?.Invoke(target, args);
    }

    private static bool InvokeCompileAssemblyForExecuteMethod(object script, string code)
    {
        var method = script.GetType().GetMethod(
            "CompileAssemblyForExecuteMethod",
            new[] { typeof(string) });
        if (method is null)
        {
            throw new MissingMethodException(script.GetType().FullName, "CompileAssemblyForExecuteMethod");
        }

        return method.Invoke(script, new object[] { code }) is true;
    }

    private static string? ReadInstanceString(object target, string propertyName) =>
        target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance)
            ?.GetValue(target) as string;

    private static QuickerRpcCodeSyntaxCheckResult Ok(string kind) =>
        new()
        {
            Ok = true,
            Success = true,
            Kind = kind,
            Message = "valid",
        };

    private static QuickerRpcCodeSyntaxCheckResult Fail(string kind, string errorCode, string message) =>
        new()
        {
            Ok = false,
            Success = false,
            Kind = kind,
            ErrorCode = errorCode,
            Message = message,
        };
}

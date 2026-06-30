using System.Reflection;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2Reflection
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static object? ReadMember(object target, string name)
    {
        var type = target.GetType();
        return type.GetProperty(name, InstanceFlags)?.GetValue(target)
            ?? type.GetField(name, InstanceFlags)?.GetValue(target);
    }

    public static string? ReadString(object target, string name) => ReadMember(target, name)?.ToString();

    public static long ReadInt64(object target, string name)
    {
        var value = ReadMember(target, name);
        return value switch
        {
            long l => l,
            int i => i,
            DateTime dt => new DateTimeOffset(dt.ToUniversalTime()).ToUnixTimeMilliseconds(),
            _ => 0,
        };
    }

    public static void WriteMember(object target, string name, object? value)
    {
        var type = target.GetType();
        var prop = type.GetProperty(name, InstanceFlags);
        if (prop?.CanWrite == true)
        {
            prop.SetValue(target, value);
            return;
        }

        type.GetField(name, InstanceFlags)?.SetValue(target, value);
    }

    public static object? InvokeStatic(Type declaringType, string methodName, params object?[] args)
    {
        var method = FindMethod(declaringType, methodName, StaticFlags, args);
        return method?.Invoke(null, args);
    }

    public static object? InvokeInstance(object target, string methodName, params object?[] args)
    {
        var method = FindMethod(target.GetType(), methodName, InstanceFlags, args);
        return method?.Invoke(target, args);
    }

    public static object? ReadTupleField(object? tuple, string itemName, string? namedField)
    {
        if (tuple is null)
        {
            return null;
        }

        var valueType = tuple.GetType();
        if (namedField is not null)
        {
            var named = valueType.GetField(namedField)?.GetValue(tuple)
                ?? valueType.GetProperty(namedField)?.GetValue(tuple);
            if (named is not null)
            {
                return named;
            }
        }

        return valueType.GetField(itemName)?.GetValue(tuple)
            ?? valueType.GetProperty(itemName)?.GetValue(tuple);
    }

    private static MethodInfo? FindMethod(Type type, string methodName, BindingFlags flags, object?[] args)
    {
        foreach (var candidate in type.GetMethods(flags))
        {
            if (!string.Equals(candidate.Name, methodName, StringComparison.Ordinal))
            {
                continue;
            }

            var parameters = candidate.GetParameters();
            if (parameters.Length != args.Length)
            {
                continue;
            }

            var match = true;
            for (var i = 0; i < parameters.Length; i++)
            {
                if (args[i] is null)
                {
                    continue;
                }

                if (!parameters[i].ParameterType.IsAssignableFrom(args[i]!.GetType()))
                {
                    match = false;
                    break;
                }
            }

            if (match)
            {
                return candidate;
            }
        }

        return type.GetMethod(methodName, flags);
    }
}

using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Quicker.Domain.Entities;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

internal static class QuickerSettingsPath
{
    public static bool TryParseKey(string key, out QuickerSettingsKey parsed, out string? error)
    {
        parsed = default;
        error = null;

        var text = (key ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            error = "key is required.";
            return false;
        }

        var separator = text.IndexOf(':');
        if (separator <= 0 || separator >= text.Length - 1)
        {
            error = "key must use scope:path format (e.g. userSettings:EnableCircleMenu).";
            return false;
        }

        var scope = text.Substring(0, separator).Trim();
        var remainder = text.Substring(separator + 1).Trim();
        if (remainder.Length == 0)
        {
            error = "key path is required after scope.";
            return false;
        }

        if (string.Equals(scope, QuickerSettingsScopes.ExeSettings, StringComparison.OrdinalIgnoreCase))
        {
            var exeSeparator = remainder.IndexOf(':');
            if (exeSeparator <= 0 || exeSeparator >= remainder.Length - 1)
            {
                error = "exeSettings key must use exeSettings:<exeFile>:<propertyPath>.";
                return false;
            }

            parsed = new QuickerSettingsKey(
                QuickerSettingsScopes.ExeSettings,
                remainder.Substring(exeSeparator + 1).Trim(),
                remainder.Substring(0, exeSeparator).Trim());
            return true;
        }

        parsed = new QuickerSettingsKey(scope, remainder, null);
        return true;
    }

    public static bool TryGetValue(QuickerSettingsKey key, out object? value, out string? typeName, out string? error)
    {
        value = null;
        typeName = null;
        error = null;

        if (!TryResolveTarget(key, writable: false, out var target, out var leafProperty, out error)
            || target is null)
        {
            return false;
        }

        if (leafProperty is null)
        {
            value = target;
            typeName = target.GetType().Name;
            return true;
        }

        try
        {
            value = leafProperty.GetValue(target);
            typeName = DescribeType(leafProperty.PropertyType);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TrySetValue(QuickerSettingsKey key, string rawValue, out string? error)
    {
        error = null;

        if (!TryResolveTarget(key, writable: true, out var target, out var leafProperty, out error)
            || target is null
            || leafProperty is null)
        {
            return false;
        }

        if (!TryConvertValue(rawValue, leafProperty.PropertyType, out var converted, out error))
        {
            return false;
        }

        try
        {
            leafProperty.SetValue(target, converted);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryPersist(QuickerSettingsKey key, out string? error)
    {
        error = null;
        return key.Scope switch
        {
            QuickerSettingsScopes.UserSettings => QuickerSettingsAccessor.TryGetUserSettings(out var settings, out error)
                && settings is not null
                && QuickerSettingsAccessor.TrySaveUserSettings(settings, out error),
            QuickerSettingsScopes.UserPreference => QuickerSettingsAccessor.TryGetUserPreference(out var preference, out error)
                && preference is not null
                && QuickerSettingsAccessor.TrySaveUserPreference(preference, out error),
            QuickerSettingsScopes.GlobalSettings => QuickerSettingsAccessor.TryGetUserSettings(out var settings, out error)
                && settings is not null
                && QuickerSettingsAccessor.TrySaveUserSettings(settings, out error),
            QuickerSettingsScopes.ExeSettings => QuickerSettingsAccessor.TryGetExeSettings(key.ExeFile ?? string.Empty, out var exeSettings, out error)
                && exeSettings is not null
                && QuickerSettingsAccessor.TrySaveExeSettings(exeSettings, out error),
            _ => Fail($"Unsupported scope: {key.Scope}", out error),
        };
    }

    public static string BuildKey(string scope, string path, string? exeFile = null) =>
        string.Equals(scope, QuickerSettingsScopes.ExeSettings, StringComparison.OrdinalIgnoreCase)
            ? $"{QuickerSettingsScopes.ExeSettings}:{exeFile}:{path}"
            : $"{scope}:{path}";

    public static string DescribeType(Type type)
    {
        var underlying = Nullable.GetUnderlyingType(type) ?? type;
        if (underlying.IsEnum)
        {
            return $"Enum({underlying.Name})";
        }

        return underlying.Name;
    }

    private static bool TryResolveTarget(
        QuickerSettingsKey key,
        bool writable,
        out object? target,
        out PropertyInfo? leafProperty,
        out string? error)
    {
        target = null;
        leafProperty = null;
        error = null;

        if (string.Equals(key.Scope, QuickerSettingsScopes.GlobalSettings, StringComparison.OrdinalIgnoreCase))
        {
            if (!QuickerSettingsAccessor.TryGetUserSettings(out var settings, out error) || settings is null)
            {
                return false;
            }

            var dictProperty = settings.GetType().GetProperty("GlobalSettings", QuickerAssemblyReflection.InstanceFlags);
            if (dictProperty?.GetValue(settings) is not IDictionary dict)
            {
                error = "UserSettings.GlobalSettings unavailable.";
                return false;
            }

            if (!dict.Contains(key.Path))
            {
                error = $"Global setting not found: {key.Path}";
                return false;
            }

            if (writable)
            {
                target = dict;
                leafProperty = null;
                return true;
            }

            target = dict[key.Path];
            return true;
        }

        object? root;
        Type? rootType;
        if (string.Equals(key.Scope, QuickerSettingsScopes.UserSettings, StringComparison.OrdinalIgnoreCase))
        {
            if (!QuickerSettingsAccessor.TryGetUserSettings(out root, out error) || root is null)
            {
                return false;
            }

            rootType = root.GetType();
        }
        else if (string.Equals(key.Scope, QuickerSettingsScopes.UserPreference, StringComparison.OrdinalIgnoreCase))
        {
            if (!QuickerSettingsAccessor.TryGetUserPreference(out root, out error) || root is null)
            {
                return false;
            }

            rootType = root.GetType();
        }
        else if (string.Equals(key.Scope, QuickerSettingsScopes.ExeSettings, StringComparison.OrdinalIgnoreCase))
        {
            if (!QuickerSettingsAccessor.TryGetExeSettings(key.ExeFile ?? string.Empty, out var exeSettings, out error)
                || exeSettings is null)
            {
                return false;
            }

            root = exeSettings;
            rootType = typeof(ExeSettings);
        }
        else
        {
            return Fail($"Unsupported scope: {key.Scope}", out error);
        }

        return TryResolvePropertyPath(root, rootType!, key.Path, writable, out target, out leafProperty, out error);
    }

    public static bool TrySetGlobalSettingsValue(string key, string rawValue, out string? error)
    {
        error = null;
        if (!QuickerSettingsAccessor.TryGetUserSettings(out var settings, out error) || settings is null)
        {
            return false;
        }

        var dictProperty = settings.GetType().GetProperty("GlobalSettings", QuickerAssemblyReflection.InstanceFlags);
        if (dictProperty?.GetValue(settings) is not IDictionary dict)
        {
            error = "UserSettings.GlobalSettings unavailable.";
            return false;
        }

        dict[key] = rawValue;
        return true;
    }

    private static bool TryResolvePropertyPath(
        object root,
        Type rootType,
        string path,
        bool writable,
        out object? target,
        out PropertyInfo? leafProperty,
        out string? error)
    {
        target = root;
        leafProperty = null;
        error = null;

        var segments = path.Split(new[] { '.' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => segment.Trim())
            .Where(segment => segment.Length > 0)
            .ToArray();
        if (segments.Length == 0)
        {
            error = "Setting path is empty.";
            return false;
        }

        object? current = root;
        var currentType = rootType;
        for (var i = 0; i < segments.Length; i++)
        {
            var segment = segments[i];
            var property = currentType.GetProperty(segment, QuickerAssemblyReflection.InstanceFlags);
            if (property is null)
            {
                error = $"Property not found: {segment}";
                return false;
            }

            if (writable && !property.CanWrite)
            {
                error = $"Property is read-only: {segment}";
                return false;
            }

            if (i == segments.Length - 1)
            {
                target = current;
                leafProperty = property;
                return true;
            }

            try
            {
                current = property.GetValue(current);
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }

            if (current is null)
            {
                error = $"Null object at {segment}; cannot traverse deeper.";
                return false;
            }

            currentType = current.GetType();
        }

        error = "Invalid setting path.";
        return false;
    }

    private static bool TryConvertValue(string rawValue, Type targetType, out object? converted, out string? error)
    {
        converted = null;
        error = null;

        var nullableUnderlying = Nullable.GetUnderlyingType(targetType);
        var effectiveType = nullableUnderlying ?? targetType;

        if (nullableUnderlying is not null && string.IsNullOrWhiteSpace(rawValue))
        {
            converted = null;
            return true;
        }

        try
        {
            if (effectiveType == typeof(string))
            {
                converted = rawValue;
                return true;
            }

            if (effectiveType == typeof(bool))
            {
                if (bool.TryParse(rawValue, out var boolValue))
                {
                    converted = boolValue;
                    return true;
                }

                if (rawValue == "1" || rawValue == "0")
                {
                    converted = rawValue == "1";
                    return true;
                }

                return Fail($"Invalid boolean value: {rawValue}", out error);
            }

            if (effectiveType.IsEnum)
            {
                try
                {
                    converted = Enum.Parse(effectiveType, rawValue, ignoreCase: true);
                    return true;
                }
                catch
                {
                    return Fail($"Invalid enum value for {effectiveType.Name}: {rawValue}", out error);
                }
            }

            if (effectiveType == typeof(int))
            {
                if (int.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var intValue))
                {
                    converted = intValue;
                    return true;
                }

                return Fail($"Invalid int value: {rawValue}", out error);
            }

            if (effectiveType == typeof(long))
            {
                if (long.TryParse(rawValue, NumberStyles.Integer, CultureInfo.InvariantCulture, out var longValue))
                {
                    converted = longValue;
                    return true;
                }

                return Fail($"Invalid long value: {rawValue}", out error);
            }

            if (effectiveType == typeof(float))
            {
                if (float.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out var floatValue))
                {
                    converted = floatValue;
                    return true;
                }

                return Fail($"Invalid float value: {rawValue}", out error);
            }

            if (effectiveType == typeof(double))
            {
                if (double.TryParse(rawValue, NumberStyles.Float, CultureInfo.InvariantCulture, out var doubleValue))
                {
                    converted = doubleValue;
                    return true;
                }

                return Fail($"Invalid double value: {rawValue}", out error);
            }

            return Fail($"Unsupported setting type: {DescribeType(targetType)}", out error);
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static bool IsScalar(Type type) =>
        type.IsPrimitive
        || type == typeof(string)
        || type == typeof(decimal)
        || type.IsEnum
        || type == typeof(DateTime);

    private static bool IsComplexLeaf(Type type) =>
        typeof(IEnumerable).IsAssignableFrom(type) && type != typeof(string);

    private static bool Fail(string message, out string? error)
    {
        error = message;
        return false;
    }
}

internal readonly struct QuickerSettingsKey
{
    public QuickerSettingsKey(string scope, string path, string? exeFile)
    {
        Scope = scope;
        Path = path;
        ExeFile = exeFile;
    }

    public string Scope { get; }

    public string Path { get; }

    public string? ExeFile { get; }
}

internal sealed class QuickerSettingsPageMeta
{
    public string PageId { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }

    public string? Keywords { get; set; }
}

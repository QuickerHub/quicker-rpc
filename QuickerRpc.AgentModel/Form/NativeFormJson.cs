using System;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.AgentModel.Form;

/// <summary>Helpers for Quicker sys:form native JSON (<c>Fields</c> / <c>fields</c>, enum <c>InputMethod</c>).</summary>
internal static class NativeFormJson
{
    /// <summary>Quicker <c>InputMethod</c> enum (see getquicker form help).</summary>
    internal static string InputMethodNameFromToken(JToken? token)
    {
        if (token is null || token.Type == JTokenType.Null)
        {
            return "TextBox";
        }

        if (token.Type == JTokenType.Integer || token.Type == JTokenType.Float)
        {
            return InputMethodNameFromEnum(Convert.ToInt32(token.Value<object>(), System.Globalization.CultureInfo.InvariantCulture));
        }

        if (token.Type == JTokenType.String && int.TryParse(
                token.Value<string>(),
                System.Globalization.NumberStyles.Integer,
                System.Globalization.CultureInfo.InvariantCulture,
                out var n))
        {
            return InputMethodNameFromEnum(n);
        }

        return token.Value<string>()?.Trim() ?? "TextBox";
    }

    internal static string InputMethodNameFromEnum(int value) =>
        value switch
        {
            2 => "TextEditor",
            3 => "DropDown",
            4 => "Slider",
            5 => "DatePicker",
            6 => "CheckBox",
            7 => "NumberBox",
            8 => "CheckComboBox",
            9 => "ColorPicker",
            10 => "PasswordBox",
            11 => "EditableDropDown",
            12 => "FontFamilySelector",
            13 => "EditableAutoCompleteDropDown",
            14 => "DictEditor",
            41 => "DisplayText",
            100 => "Separator",
            1 => "TextBox",
            _ => "TextBox",
        };

    internal static bool TryGetFieldsArray(JObject root, out JArray? fields)
    {
        fields = null;
        if (root["fields"] is JArray f)
        {
            fields = f;
            return fields.Count > 0;
        }

        if (root["Fields"] is JArray F)
        {
            fields = F;
            return fields.Count > 0;
        }

        return false;
    }

    internal static bool LooksLikeNativeRoot(JObject root)
    {
        if (!TryGetFieldsArray(root, out var fields) || fields is null)
        {
            return false;
        }

        foreach (var token in fields)
        {
            if (token is not JObject field)
            {
                continue;
            }

            if (field["FieldKey"] is not null
                || field["fieldKey"] is not null
                || field["Label"] is not null
                || field["label"] is not null)
            {
                return true;
            }
        }

        return false;
    }
}

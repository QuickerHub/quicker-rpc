using System;
using System.Diagnostics;
using System.Linq;
using System.Reflection;
using System.Windows;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Core;
using QuickerRpc.AgentModel.XAction;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write helpers for an open <c>ActionDesignerWindow</c> (in-process, UI thread).
/// </summary>
internal static class ActionDesignerContext
{
    private static readonly JsonSerializerSettings ExportJson = new()
    {
        Formatting = Formatting.Indented,
        NullValueHandling = NullValueHandling.Ignore,
    };

    public static Window? TryGetForegroundDesigner()
    {
        var active = Application.Current?.Windows
            .OfType<Window>()
            .FirstOrDefault(w => w.IsActive && ActionDesignerReflection.IsDesignerWindow(w));
        if (active is not null)
        {
            return active;
        }

        return Application.Current?.Windows
            .OfType<Window>()
            .FirstOrDefault(ActionDesignerReflection.IsDesignerWindow);
    }

    public static bool TryExportXActionJson(Window designer, out string? json, out string? error)
    {
        json = null;
        error = null;
        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var xAction) || xAction is null)
        {
            error = "Designer Action is not available.";
            return false;
        }

        try
        {
            json = JsonConvert.SerializeObject(xAction, ExportJson);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryExportCompressedXActionJson(Window designer, out string? json, out string? error)
    {
        json = null;
        error = null;
        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var xActionObj) || xActionObj is null)
        {
            error = "Designer Action is not available.";
            return false;
        }

        try
        {
            var body = JObject.Parse(JsonConvert.SerializeObject(xActionObj));
            var (steps, variables, subPrograms) = ActionProgramContent.ReadBodyArrays(body);
            XActionProgramService.EnsureEphemeralIds(steps, variables);

            var catalog = StepRunnerCatalogFromQuicker.Build();
            var compressedRoot = XActionProgramService.Compress(
                XActionGetReturnMode.Full,
                steps,
                variables,
                catalog,
                omitDefaultLiteralInputs: true);

            if (subPrograms.Count > 0)
            {
                compressedRoot["subPrograms"] = ActionEmbeddedSubProgramWire.CompressFromNative(
                    subPrograms,
                    catalog,
                    omitDefaultLiteralInputs: true);
            }

            var actionId = TryReadDesignerEntityId(designer);
            if (!string.IsNullOrWhiteSpace(actionId))
            {
                compressedRoot["actionId"] = actionId.Trim();
            }

            compressedRoot["returnMode"] = XActionGetReturnModeParser.ToWire(XActionGetReturnMode.Full);
            compressedRoot["omitDefaultLiteralInputsApplied"] = true;
            compressedRoot["subProgramCount"] = subPrograms.Count;

            json = JTokenCompat.Format(compressedRoot, Formatting.Indented);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool TryImportXActionJson(Window designer, string json, out string? error) =>
        ActionDesignerCurrentActionAccess.TrySetActionDefinition(designer, json, out error);

    public static bool TryCopyActionId(Window designer, out string? actionId, out string? error)
    {
        actionId = null;
        error = null;
        var id = TryReadDesignerEntityId(designer);
        if (string.IsNullOrWhiteSpace(id))
        {
            error = "Action id not found on designer.";
            return false;
        }

        actionId = id.Trim();
        return true;
    }

    public static string? TryReadDesignerEntityId(Window designer)
    {
        if (designer is null)
        {
            return null;
        }

        try
        {
            var winType = designer.GetType();
            var flags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;
            if (designer.Tag is string tagStr && !string.IsNullOrWhiteSpace(tagStr))
            {
                return tagStr.Trim();
            }

            var editing = winType.GetProperty("EditingActionItem2", flags)?.GetValue(designer)
                ?? winType.GetProperty("EditingActionItem", flags)?.GetValue(designer);
            if (editing is null)
            {
                return null;
            }

            var editingType = editing.GetType();
            var idValue = editingType.GetProperty("Id", flags)?.GetValue(editing);
            return idValue switch
            {
                string s => s,
                Guid g => g.ToString("D"),
                _ => idValue?.ToString(),
            };
        }
        catch (Exception ex)
        {
            Trace.TraceWarning("[QuickerRpc.Plugin] TryReadDesignerEntityId failed: {0}", ex.Message);
            return null;
        }
    }

    public static bool TryCopySelectedVariableKeys(Window designer, out string text, out string? error)
    {
        text = string.Empty;
        error = null;
        if (!ActionDesignerReflection.TryGetSelectedVariableKeys(designer, out var keys) || keys.Length == 0)
        {
            error = "No variables selected.";
            return false;
        }

        text = string.Join(Environment.NewLine, keys);
        return true;
    }

    public static bool TrySave(Window designer, out string? error)
    {
        error = null;
        var entityId = TryReadDesignerEntityId(designer);
        if (string.IsNullOrWhiteSpace(entityId))
        {
            error = "Action id not found.";
            return false;
        }

        if (!ActionDesignerReflection.TryGetActionProperty(designer, out var xActionObj) || xActionObj is null)
        {
            error = "Designer Action is not available.";
            return false;
        }

        if (xActionObj is not XAction xAction)
        {
            try
            {
                xAction = JsonConvert.DeserializeObject<XAction>(
                    JsonConvert.SerializeObject(xActionObj))
                    ?? throw new InvalidOperationException("XAction deserialize returned null.");
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        var isSubProgram = IsSubProgramDesigner(designer);
        if (isSubProgram)
        {
            return ActionDesignerUiSave.TryPersistOpenSubProgramDesignerOnUiThread(entityId, xAction, out error);
        }

        return ActionDesignerUiSave.TryPersistOpenActionDesignerOnUiThread(entityId, xAction, out error);
    }

    internal static bool IsSubProgramDesigner(Window designer)
    {
        try
        {
            var prop = designer.GetType().GetProperty(
                "IsSubProgram",
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            return prop?.GetValue(designer) is bool b && b;
        }
        catch
        {
            return false;
        }
    }
}

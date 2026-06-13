using System;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain.Actions.X;
using QuickerRpc.AgentModel.Core;

namespace QuickerRpc.Plugin.Services;

/// <summary>Apply presentation fields on designer editing/result entities (ActionItem, SubProgram, ActionItem2).</summary>
internal static class DesignerEntityPresentation
{
    private static readonly BindingFlags InstanceAll =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static bool TryApply(
        object entity,
        bool isSubProgram,
        string? titleOrName,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        if (entity is ActionItem actionItem)
        {
            return ActionPresentationUpdate.TryApply(
                actionItem,
                titleOrName,
                description,
                icon,
                contextMenuData,
                out error);
        }

        if (entity is SubProgram subProgram)
        {
            return SubProgramPresentationUpdate.TryApply(subProgram, titleOrName, description, icon, out error);
        }

        return TryApplyViaReflection(
            entity,
            isSubProgram,
            titleOrName,
            description,
            icon,
            contextMenuData,
            out error);
    }

    private static bool TryApplyViaReflection(
        object entity,
        bool isSubProgram,
        string? titleOrName,
        string? description,
        string? icon,
        string? contextMenuData,
        out string? error)
    {
        error = null;
        var changed = false;
        var entityType = entity.GetType();

        if (titleOrName is not null)
        {
            var trimmed = titleOrName.Trim();
            if (trimmed.Length == 0)
            {
                error = isSubProgram ? "name cannot be empty." : "title cannot be empty.";
                return false;
            }

            if (isSubProgram)
            {
                if (!DataServiceSubProgramAccessor.IsValidName(trimmed))
                {
                    error = $"Invalid subprogram name: {trimmed}";
                    return false;
                }

                if (!TrySetStringProperty(entityType, entity, "Name", trimmed))
                {
                    error = "Designer entity has no Name property.";
                    return false;
                }
            }
            else if (!TrySetStringProperty(entityType, entity, "Title", trimmed))
            {
                error = "Designer entity has no Title property.";
                return false;
            }

            changed = true;
        }

        if (description is not null)
        {
            if (!TrySetStringProperty(entityType, entity, "Description", description))
            {
                error = "Designer entity has no Description property.";
                return false;
            }

            changed = true;
        }

        if (icon is not null)
        {
            if (!FontAwesomeIconValidation.TryValidate(icon, allowEmpty: true, out error))
            {
                return false;
            }

            if (!TrySetStringProperty(entityType, entity, "Icon", icon.Trim()))
            {
                error = "Designer entity has no Icon property.";
                return false;
            }

            changed = true;
        }

        if (contextMenuData is not null)
        {
            if (contextMenuData.Length > ActionPresentationUpdate.MaxContextMenuDataLength)
            {
                error = $"contextMenuData exceeds max length ({ActionPresentationUpdate.MaxContextMenuDataLength}).";
                return false;
            }

            if (!TrySetStringProperty(entityType, entity, "ContextMenuData", contextMenuData))
            {
                error = "Designer entity has no ContextMenuData property.";
                return false;
            }

            changed = true;
        }

        if (!changed)
        {
            error = "At least one presentation field must be provided.";
            return false;
        }

        return true;
    }

    private static bool TrySetStringProperty(Type entityType, object entity, string propertyName, string value)
    {
        var prop = entityType.GetProperty(propertyName, InstanceAll);
        if (prop is null || !prop.CanWrite || prop.PropertyType != typeof(string))
        {
            return false;
        }

        prop.SetValue(entity, value);
        return true;
    }
}

using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>Apply name / description / icon on <see cref="SubProgram"/> (null field = omit).</summary>
internal static class SubProgramPresentationUpdate
{
    public static bool TryApply(
        SubProgram subProgram,
        string? name,
        string? description,
        string? icon,
        out string? error)
    {
        error = null;
        var changed = false;

        if (name is not null)
        {
            var trimmed = name.Trim();
            if (trimmed.Length == 0)
            {
                error = "name cannot be empty.";
                return false;
            }

            if (!DataServiceSubProgramAccessor.IsValidName(trimmed))
            {
                error = $"Invalid subprogram name: {trimmed}";
                return false;
            }

            subProgram.Name = trimmed;
            changed = true;
        }

        if (description is not null)
        {
            subProgram.Description = description;
            changed = true;
        }

        if (icon is not null)
        {
            if (!FontAwesomeIconValidation.TryValidate(icon, allowEmpty: true, out error))
            {
                return false;
            }

            subProgram.Icon = icon.Trim();
            changed = true;
        }

        if (!changed)
        {
            error = "At least one of name (or title), description, or icon must be provided.";
            return false;
        }

        return true;
    }

    /// <summary>Patch may use <c>name</c> or <c>title</c> (same as compressed metadata).</summary>
    public static string? ReadOptionalPatchName(Newtonsoft.Json.Linq.JObject patch)
    {
        var title = ActionPresentationUpdate.ReadOptionalPatchString(patch["title"]);
        if (title is not null)
        {
            return title;
        }

        return ActionPresentationUpdate.ReadOptionalPatchString(patch["name"]);
    }
}

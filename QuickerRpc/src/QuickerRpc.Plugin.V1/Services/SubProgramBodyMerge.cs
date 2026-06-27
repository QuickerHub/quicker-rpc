using System.Collections.Generic;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Same field merge as <c>DesignerHostUiSave.MergeSubProgramBody</c> before
/// <c>TriggerCommandService.SaveGlobalSubProgram</c>.
/// </summary>
internal static class SubProgramBodyMerge
{
    public static SubProgram Merge(SubProgram live, XAction x)
    {
        return new SubProgram
        {
            Id = live.Id,
            Name = live.Name,
            Description = live.Description,
            Icon = live.Icon,
            CreateTimeUtc = live.CreateTimeUtc,
            TemplateId = live.TemplateId,
            TemplateRevision = live.TemplateRevision,
            SharedId = live.SharedId,
            ShareTimeUtc = live.ShareTimeUtc,
            SummaryExpression = string.IsNullOrWhiteSpace(x.SummaryExpression)
                ? (string.IsNullOrWhiteSpace(live.SummaryExpression) ? "$$" : live.SummaryExpression)
                : x.SummaryExpression,
            Steps = x.Steps,
            Variables = x.Variables,
            SubPrograms = x.SubPrograms ?? new List<SubProgram>(),
        };
    }
}

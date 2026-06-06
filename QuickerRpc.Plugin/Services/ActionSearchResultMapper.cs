using System.Linq;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

internal static class ActionSearchResultMapper
{
    internal static QuickerRpcActionSearchResult FromSummaries(
        QuickerRpcSearchActionSummariesResult source)
    {
        if (!source.Success)
        {
            return new QuickerRpcActionSearchResult
            {
                Ok = false,
                Scope = source.Scope,
                Message = source.ErrorMessage ?? "Action query failed.",
            };
        }

        return new QuickerRpcActionSearchResult
        {
            Ok = true,
            Scope = source.Scope,
            Message = source.MatchCount == 0 ? "No matching actions." : string.Empty,
            Items = source.Items
                .Select(item => new QuickerRpcActionSummary
                {
                    Id = item.ActionId,
                    Title = item.Title,
                    Description = string.IsNullOrWhiteSpace(item.Description) ? null : item.Description,
                    PageTitle = item.ProfileName,
                    ProfileId = item.ProfileId,
                    ProfileName = item.ProfileName,
                    ExeFile = item.ExeFile,
                    TemplateId = item.TemplateId,
                    SharedActionId = item.SharedActionId,
                    Source = item.Source,
                })
                .ToList(),
        };
    }
}

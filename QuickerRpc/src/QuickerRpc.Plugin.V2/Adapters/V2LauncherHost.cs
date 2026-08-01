using System.Text.Json;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Adapters;

/// <summary>Resolves launcher intents from the V2 action and subprogram catalogs.</summary>
internal sealed class V2LauncherHost : IQuickerRpcLauncherHost
{
    private readonly IQuickerRpcSearchHost _search;

    public V2LauncherHost(IQuickerRpcSearchHost search) => _search = search;

    public async Task<QuickerRpcResolveLauncherIntentResult> ResolveIntentAsync(
        string query,
        int maxResults = 12,
        string? scopes = null,
        CancellationToken cancellationToken = default)
    {
        var text = (query ?? string.Empty).Trim();
        var terms = LauncherQueryParser.ParseAlternatives(text);
        if (terms.Count == 0)
        {
            return new QuickerRpcResolveLauncherIntentResult
            {
                Ok = false,
                Query = text,
                Message = "query is required.",
            };
        }

        var limit = Math.Clamp(maxResults, 1, 30);
        var scopeSet = ParseScopes(scopes);
        var includeActions = scopeSet is null || scopeSet.Contains("actions");
        var includeSubPrograms = scopeSet is null || scopeSet.Contains("subprograms");
        var candidates = new List<QuickerRpcLauncherIntentCandidate>();
        var dedupe = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var matchedTerms = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var term in terms)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var keyword = LauncherQueryParser.ToSearchKeyword(term);
            var matched = false;

            if (includeActions)
            {
                var actions = await _search.SearchActionSummariesAsync(
                    keyword,
                    limit,
                    cancellationToken: cancellationToken).ConfigureAwait(false);
                if (actions.Success)
                {
                    foreach (var action in actions.Items)
                    {
                        if (string.IsNullOrWhiteSpace(action.ActionId))
                        {
                            continue;
                        }

                        var key = "action:" + action.ActionId;
                        if (!dedupe.Add(key))
                        {
                            matched = true;
                            continue;
                        }

                        matched = true;
                        candidates.Add(new QuickerRpcLauncherIntentCandidate
                        {
                            Kind = "action",
                            Score = 400 + Math.Min(action.Score ?? 0, 250),
                            Title = action.Title,
                            Subtitle = action.Description,
                            ActionId = action.ActionId,
                            SuggestedTool = "qkrpc_action",
                            SuggestedInputJson = JsonSerializer.Serialize(new
                            {
                                action = "run",
                                id = action.ActionId,
                            }),
                            Reason = "V2 action catalog search",
                            MatchedQueryTerm = term,
                            MatchedOn = LauncherQueryParser.FindMatchedOn(
                                term,
                                ("title", action.Title),
                                ("description", action.Description),
                                ("actionId", action.ActionId)),
                        });
                    }
                }
            }

            if (includeSubPrograms)
            {
                var subPrograms = await _search.SearchGlobalSubProgramsAsync(
                    keyword,
                    limit,
                    cancellationToken).ConfigureAwait(false);
                if (subPrograms.Ok)
                {
                    foreach (var subProgram in subPrograms.Items)
                    {
                        if (string.IsNullOrWhiteSpace(subProgram.Id))
                        {
                            continue;
                        }

                        var key = "subprogram:" + subProgram.Id;
                        if (!dedupe.Add(key))
                        {
                            matched = true;
                            continue;
                        }

                        matched = true;
                        candidates.Add(new QuickerRpcLauncherIntentCandidate
                        {
                            Kind = "subprogram",
                            Score = 350 + Math.Min(subProgram.Score, 250),
                            Title = subProgram.Name,
                            Subtitle = subProgram.Description,
                            SubProgramId = subProgram.Id,
                            SuggestedTool = "qkrpc_subprogram",
                            SuggestedInputJson = JsonSerializer.Serialize(new
                            {
                                action = "get",
                                id = subProgram.Id,
                            }),
                            Reason = "V2 subprogram catalog search",
                            MatchedQueryTerm = term,
                            MatchedOn = LauncherQueryParser.FindMatchedOn(
                                term,
                                ("name", subProgram.Name),
                                ("description", subProgram.Description),
                                ("subProgramId", subProgram.Id)),
                        });
                    }
                }
            }

            if (matched)
            {
                matchedTerms.Add(term);
            }
        }

        var ranked = candidates
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Title, StringComparer.OrdinalIgnoreCase)
            .Take(limit)
            .ToList();
        var missedTerms = terms.Where(term => !matchedTerms.Contains(term)).ToList();

        return new QuickerRpcResolveLauncherIntentResult
        {
            Ok = ranked.Count > 0,
            Query = text,
            NormalizedQuery = string.Join(" | ", terms),
            QueryTerms = terms.ToList(),
            MissedTerms = missedTerms,
            Message = ranked.Count == 0
                ? "No launcher intent matched."
                : $"Top match: {ranked[0].Title} ({ranked[0].Kind})",
            Candidates = ranked,
        };
    }

    private static HashSet<string>? ParseScopes(string? scopes)
    {
        if (string.IsNullOrWhiteSpace(scopes))
        {
            return null;
        }

        return scopes
            .Split([',', ';', '|', ' '], StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}

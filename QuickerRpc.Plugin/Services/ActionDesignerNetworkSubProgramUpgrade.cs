using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Windows;
using Quicker.Domain;
using Quicker.Domain.Actions.X.Storage;
using Quicker.Domain.Actions.X.SubPrograms;
using Quicker.Domain.Services;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Bumps <c>@@sharedId@revision@title</c> network subprogram identifiers on selected designer steps
/// to the latest revision from getquicker.net (same behavior as quicker.exe「升级网络子程序」).
/// </summary>
internal static class ActionDesignerNetworkSubProgramUpgrade
{
    private const string SubProgramPageUrl = "https://getquicker.net/SubProgram?id=";
    private static readonly Regex RevisionTableRegex = new(
        @"修订版本\s*\|\s*(\d+)",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly HttpClient Http = CreateHttpClient();

    public static bool TryUpgradeSelected(Window designer, out int upgradedCount, out string? error)
    {
        upgradedCount = 0;
        error = null;

        if (!ActionDesignerReflection.TryGetSelectedSteps(designer, out var selected) || selected.Count == 0)
        {
            error = "请先选中包含网络子程序的步骤。";
            return false;
        }

        var revisionCache = new Dictionary<Guid, int>();
        foreach (var root in selected)
        {
            foreach (var step in EnumerateStepSubtree(root))
            {
                upgradedCount += TryUpgradeStepInputParams(step, revisionCache);
            }
        }

        if (upgradedCount == 0)
        {
            error = "选中步骤中没有可升级的网络子程序（或已是最新版本）。";
            return false;
        }

        ActionDesignerReflection.TryRefreshDesignerUi(designer);
        return true;
    }

    private static int TryUpgradeStepInputParams(ActionStep step, Dictionary<Guid, int> revisionCache)
    {
        var count = 0;
        if (step.InputParams is null)
        {
            return count;
        }

        foreach (var param in step.InputParams.Values)
        {
            var value = param.Value?.Trim();
            if (string.IsNullOrEmpty(value) || !value.StartsWith("@@", StringComparison.Ordinal))
            {
                continue;
            }

            if (!TryUpgradeNetworkIdentifier(value, revisionCache, out var upgraded))
            {
                continue;
            }

            param.Value = upgraded;
            count++;
        }

        return count;
    }

    private static bool TryUpgradeNetworkIdentifier(
        string identifier,
        Dictionary<Guid, int> revisionCache,
        out string upgraded)
    {
        upgraded = identifier;
        try
        {
            var (id, currentRevision, title) = SubProgramHelper.ParseNetSharedSpIdentifier(identifier);
            if (id == Guid.Empty)
            {
                return false;
            }

            if (!TryResolveLatestRevision(id, revisionCache, out var latestRevision))
            {
                return false;
            }

            if (latestRevision <= currentRevision)
            {
                return false;
            }

            upgraded = SubProgramHelper.GetNetSharedSpIdentifier(id, latestRevision, title);
            return !string.Equals(identifier, upgraded, StringComparison.Ordinal);
        }
        catch (Exception ex)
        {
            Trace.TraceWarning(
                "[QuickerRpc.Plugin] TryUpgradeNetworkIdentifier failed for {0}: {1}",
                identifier,
                ex.Message);
            return false;
        }
    }

    private static bool TryResolveLatestRevision(Guid sharedId, Dictionary<Guid, int> revisionCache, out int revision)
    {
        if (revisionCache.TryGetValue(sharedId, out revision))
        {
            return revision > 0;
        }

        if (TryFetchLatestRevisionFromDataService(sharedId, out revision))
        {
            revisionCache[sharedId] = revision;
            return true;
        }

        if (TryFetchLatestRevisionFromWeb(sharedId, out revision))
        {
            revisionCache[sharedId] = revision;
            return true;
        }

        revisionCache[sharedId] = 0;
        return false;
    }

    private static bool TryFetchLatestRevisionFromDataService(Guid sharedId, out int revision)
    {
        revision = 0;
        try
        {
            var dataService = AppState.DataService as DataService;
            if (dataService is null)
            {
                return false;
            }

            var subProgram = dataService.GetSharedSubProgram(sharedId.ToString("D"), string.Empty);
            if (subProgram is null)
            {
                return false;
            }

            revision = subProgram.TemplateRevision;
            return revision > 0;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning(
                "[QuickerRpc.Plugin] GetSharedSubProgram failed for {0}: {1}",
                sharedId,
                ex.Message);
            return false;
        }
    }

    private static bool TryFetchLatestRevisionFromWeb(Guid sharedId, out int revision)
    {
        revision = 0;
        try
        {
            var body = Http.GetStringAsync(SubProgramPageUrl + sharedId.ToString("D"))
                .ConfigureAwait(false)
                .GetAwaiter()
                .GetResult();
            if (string.IsNullOrWhiteSpace(body))
            {
                return false;
            }

            var match = RevisionTableRegex.Match(body);
            if (!match.Success || !int.TryParse(match.Groups[1].Value, out revision))
            {
                return false;
            }

            return revision > 0;
        }
        catch (Exception ex)
        {
            Trace.TraceWarning(
                "[QuickerRpc.Plugin] SubProgram page fetch failed for {0}: {1}",
                sharedId,
                ex.Message);
            return false;
        }
    }

    private static IEnumerable<ActionStep> EnumerateStepSubtree(ActionStep root)
    {
        yield return root;

        if (root.IfSteps is not null)
        {
            foreach (var child in root.IfSteps)
            {
                if (child is null)
                {
                    continue;
                }

                foreach (var nested in EnumerateStepSubtree(child))
                {
                    yield return nested;
                }
            }
        }

        if (root.ElseSteps is not null)
        {
            foreach (var child in root.ElseSteps)
            {
                if (child is null)
                {
                    continue;
                }

                foreach (var nested in EnumerateStepSubtree(child))
                {
                    yield return nested;
                }
            }
        }
    }

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(20),
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        return client;
    }
}

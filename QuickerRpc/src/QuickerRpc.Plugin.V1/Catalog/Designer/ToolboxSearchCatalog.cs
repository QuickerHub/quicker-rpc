using System;
using System.Collections.Generic;
using System.Linq;
namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>
/// Toolbox module search catalog: parent rows match on full runner identity; control-field rows match only on
/// sub key/name/own description — never parent title or inherited parent description, so a parent-title hit does
/// not return every child. Display <see cref="StepQuickInsertCatalog.CatalogRow.Label"/> omits the parent prefix
/// (tree UI already shows the parent row).
/// </summary>
/// <remarks>Ported from Quicker.ActionDesigner.Backend for parity with the legacy HTTP backend.</remarks>
internal static class ToolboxSearchCatalog
{
    internal static List<StepQuickInsertCatalog.CatalogRow> BuildRows(DesignerStepRunnerUiCatalog catalog)
    {
        var items = catalog.Items;
        var parentKeys = new HashSet<string>(
            items.Select(it => (it.Key ?? "").Trim()).Where(k => k.Length > 0),
            StringComparer.Ordinal);

        var outRows = new List<StepQuickInsertCatalog.CatalogRow>();

        foreach (var it in items)
        {
            var pk = (it.Key ?? "").Trim();
            if (pk.Length == 0)
            {
                continue;
            }

            var parentLabel = (it.Name ?? "").Trim();
            if (parentLabel.Length == 0)
            {
                parentLabel = pk;
            }

            var parentDesc = (it.Description ?? "").Trim();
            var icon = (it.Icon ?? "").Trim();
            string? iconOrNull = icon.Length > 0 ? icon : null;
            var kwLine = StepQuickInsertCatalog.FormatKeywordsLine(it.Keywords);
            var parentBlobSource = StepQuickInsertCatalog.JoinNonEmptyMatchParts(" ", pk, parentLabel, parentDesc, kwLine);
            var parentTitleSource = StepQuickInsertCatalog.JoinNonEmptyMatchParts(" ", pk, parentLabel, kwLine);

            outRows.Add(
                new StepQuickInsertCatalog.CatalogRow
                {
                    Kind = "runner",
                    Id = "r:" + pk,
                    Label = parentLabel,
                    Description = parentDesc,
                    MatchSurface = parentBlobSource,
                    MatchSurfaceTitle = parentTitleSource,
                    MatchSurfaceDesc = parentDesc,
                    MatchKeywords = kwLine,
                    Payload = new StepQuickInsertCatalog.RunnerPayloadDto
                    {
                        StepRunnerKey = pk,
                        Name = parentLabel,
                        Icon = iconOrNull
                    }
                });

            foreach (var sub in it.SubItems)
            {
                var sk = (sub.Key ?? "").Trim();
                if (sk.Length == 0)
                {
                    continue;
                }

                var subName = (sub.Name ?? "").Trim();
                if (subName.Length == 0)
                {
                    subName = sk;
                }

                var subDescOwn = (sub.Description ?? "").Trim();
                var subDescDisplay = subDescOwn.Length > 0 ? subDescOwn : parentDesc;

                var isPeerRunner =
                    items.Any(x => string.Equals((x.Key ?? "").Trim(), sk, StringComparison.Ordinal))
                    || parentKeys.Contains(sk);

                StepQuickInsertCatalog.RunnerPayloadDto payload;
                string label;
                string blobSource;
                string titleSource;
                string matchSurfaceDesc;
                string subKwLine;

                if (isPeerRunner)
                {
                    var peer = items.FirstOrDefault(x => string.Equals((x.Key ?? "").Trim(), sk, StringComparison.Ordinal));
                    subKwLine = StepQuickInsertCatalog.FormatKeywordsLine(peer?.Keywords);
                    label = subName;
                    // Peer rows: align haystack with legacy plugin (parent key/label/desc + sub) for discoverability.
                    var subDescForMatch = subDescOwn.Length > 0 ? subDescOwn : parentDesc;
                    blobSource = StepQuickInsertCatalog.JoinNonEmptyMatchParts(
                        " ",
                        pk,
                        sk,
                        subName,
                        subDescForMatch,
                        parentLabel,
                        subKwLine);
                    titleSource = StepQuickInsertCatalog.JoinNonEmptyMatchParts(" ", sk, subName, subKwLine);
                    matchSurfaceDesc = subDescDisplay;
                    payload = new StepQuickInsertCatalog.RunnerPayloadDto
                    {
                        StepRunnerKey = sk,
                        Name = subName,
                        Icon = iconOrNull
                    };
                }
                else
                {
                    subKwLine = kwLine;
                    var controlMatchTail = subDescOwn.Length > 0 ? subDescOwn : "";
                    label = subName;
                    blobSource = string.IsNullOrEmpty(controlMatchTail)
                        ? StepQuickInsertCatalog.JoinNonEmptyMatchParts(" ", sk, subName)
                        : StepQuickInsertCatalog.JoinNonEmptyMatchParts(" ", sk, subName, controlMatchTail);
                    titleSource = $"{sk} {subName}";
                    matchSurfaceDesc = string.IsNullOrEmpty(controlMatchTail) ? subName : controlMatchTail;
                    payload = new StepQuickInsertCatalog.RunnerPayloadDto
                    {
                        StepRunnerKey = pk,
                        Name = subName,
                        Icon = iconOrNull,
                        ControlFieldValue = sk
                    };
                }

                outRows.Add(
                    new StepQuickInsertCatalog.CatalogRow
                    {
                        Kind = "runner",
                        Id = $"r:{pk}:{sk}",
                        Label = label,
                        Description = subDescDisplay,
                        MatchSurface = blobSource,
                        MatchSurfaceTitle = titleSource,
                        MatchSurfaceDesc = matchSurfaceDesc,
                        MatchKeywords = subKwLine,
                        Payload = payload
                    });
            }
        }

        return outRows;
    }
}

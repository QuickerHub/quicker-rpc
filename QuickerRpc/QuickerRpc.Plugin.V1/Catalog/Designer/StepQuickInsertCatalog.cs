using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>
/// Flat catalog for step quick-insert (step runners + optional subprograms), aligned with web
/// <c>buildQuickInsertCandidates</c>. Match and highlight use <see cref="DesignerFastMatcher"/> (same stack as Quicker <c>MatchHelper</c>).
/// </summary>
/// <remarks>Ported from Quicker.ActionDesigner.Backend for parity with the legacy HTTP backend.</remarks>
internal static class StepQuickInsertCatalog
{
    internal const int PageSize = 20;

    /// <summary>
    /// Sort key: weight for <see cref="CatalogRow.Label"/> match score (visible list title).
    /// Kept well below <see cref="SortKeyTierScale"/> so tier (title vs desc vs blob) still dominates.
    /// </summary>
    private const long SortKeyLabelEngineMultiplier = 45_000L;

    /// <summary>
    /// Extra sort boost when every keyword pattern matches on <see cref="CatalogRow.Label"/> alone.
    /// </summary>
    private const long SortKeyLabelFullMatchBonus = 5_000_000L;

    private const long SortKeyTierScale = 100_000_000L;

    internal sealed class SubProgramInput
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        /// <summary>Resolved subProgram param value (same as web <c>formatSubProgramIdentifier</c>).</summary>
        public string Identifier { get; set; } = "";
    }

    internal sealed class CatalogRow
    {
        public string Kind { get; set; } = "";
        public string Id { get; set; } = "";
        public string Label { get; set; } = "";
        public string Description { get; set; } = "";
        public RunnerPayloadDto? Payload { get; set; }
        public string? SubProgramIdentifier { get; set; }
        /// <summary>Natural text for pinyin / substring search (keys + labels + descriptions).</summary>
        public string MatchSurface { get; set; } = "";
        /// <summary>Title / identity tier for ranking and “title hit” detection.</summary>
        public string MatchSurfaceTitle { get; set; } = "";
        /// <summary>Description-only tier.</summary>
        public string MatchSurfaceDesc { get; set; } = "";

        /// <summary>
        /// Space-joined <see cref="StepRunnerItem.Keywords"/> (Step <c>[Step(KeyWords=…)]</c> only, not auto Name);
        /// used for synonym-only label HTML and optional ranking.
        /// </summary>
        public string MatchKeywords { get; set; } = "";
    }

    internal sealed class RunnerPayloadDto
    {
        public string StepRunnerKey { get; set; } = "";
        public string Name { get; set; } = "";
        public string? Icon { get; set; }
        public string? ControlFieldValue { get; set; }
    }

    internal static string FormatKeywordsLine(IEnumerable<string>? keywords)
    {
        if (keywords == null)
        {
            return "";
        }

        var parts = keywords.Select(k => (k ?? "").Trim()).Where(k => k.Length > 0).ToList();
        return parts.Count == 0 ? "" : string.Join(" ", parts);
    }

    internal static string JoinNonEmptyMatchParts(string separator, params string?[] parts) =>
        string.Join(separator, parts.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!.Trim()));

    internal static List<CatalogRow> BuildRows(DesignerStepRunnerUiCatalog catalog, IReadOnlyList<SubProgramInput>? subPrograms)
    {
        var items = catalog.Items;
        var parentKeys = new HashSet<string>(
            items.Select(it => (it.Key ?? "").Trim()).Where(k => k.Length > 0),
            StringComparer.Ordinal);

        var outRows = new List<CatalogRow>();

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
            var kwLine = FormatKeywordsLine(it.Keywords);
            var parentBlobSource = JoinNonEmptyMatchParts(" ", pk, parentLabel, parentDesc, kwLine);
            var parentTitleSource = JoinNonEmptyMatchParts(" ", pk, parentLabel, kwLine);

            outRows.Add(new CatalogRow
            {
                Kind = "runner",
                Id = "r:" + pk,
                Label = parentLabel,
                Description = parentDesc,
                MatchSurface = parentBlobSource,
                MatchSurfaceTitle = parentTitleSource,
                MatchSurfaceDesc = parentDesc,
                MatchKeywords = kwLine,
                Payload = new RunnerPayloadDto
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

                var subDesc = (sub.Description ?? "").Trim();
                if (subDesc.Length == 0)
                {
                    subDesc = parentDesc;
                }

                var isPeerRunner = items.Any(x => string.Equals((x.Key ?? "").Trim(), sk, StringComparison.Ordinal))
                    || parentKeys.Contains(sk);

                RunnerPayloadDto payload;
                string label;
                string blobSource;
                string titleSource;
                string subKwLine;
                if (isPeerRunner)
                {
                    var peer = items.FirstOrDefault(x => string.Equals((x.Key ?? "").Trim(), sk, StringComparison.Ordinal));
                    subKwLine = FormatKeywordsLine(peer?.Keywords);
                    label = subName;
                    blobSource = JoinNonEmptyMatchParts(" ", sk, subName, subDesc, subKwLine);
                    titleSource = JoinNonEmptyMatchParts(" ", sk, subName, subKwLine);
                    payload = new RunnerPayloadDto
                    {
                        StepRunnerKey = sk,
                        Name = subName,
                        Icon = iconOrNull
                    };
                }
                else
                {
                    subKwLine = kwLine;
                    label = $"{parentLabel} › {subName}";
                    blobSource = JoinNonEmptyMatchParts(" ", pk, sk, subName, subDesc, parentLabel, kwLine);
                    titleSource = JoinNonEmptyMatchParts(" ", pk, sk, subName, parentLabel, kwLine);
                    payload = new RunnerPayloadDto
                    {
                        StepRunnerKey = pk,
                        Name = subName,
                        Icon = iconOrNull,
                        ControlFieldValue = sk
                    };
                }

                outRows.Add(new CatalogRow
                {
                    Kind = "runner",
                    Id = $"r:{pk}:{sk}",
                    Label = label,
                    Description = subDesc,
                    MatchSurface = blobSource,
                    MatchSurfaceTitle = titleSource,
                    MatchSurfaceDesc = subDesc,
                    MatchKeywords = subKwLine,
                    Payload = payload
                });
            }
        }

        var seenSp = new HashSet<string>(StringComparer.Ordinal);
        if (subPrograms != null)
        {
            foreach (var sp in subPrograms)
            {
                var id = (sp.Id ?? "").Trim();
                var ident = (sp.Identifier ?? "").Trim();
                if (ident.Length == 0)
                {
                    continue;
                }

                var key = $"{id}:{ident}";
                if (!seenSp.Add(key))
                {
                    continue;
                }

                var label = (sp.Name ?? "").Trim();
                if (label.Length == 0)
                {
                    label = ident;
                }

                var desc = (sp.Description ?? "").Trim();
                var blobSource = $"子程序 subprogram {ident} {label} {desc} {id}";
                var titleSourceSp = $"子程序 subprogram {ident} {label} {id}";
                outRows.Add(new CatalogRow
                {
                    Kind = "subprogram",
                    Id = string.IsNullOrEmpty(id) ? "sp:" + ident : "sp:" + id,
                    Label = "子程序: " + label,
                    Description = desc,
                    MatchSurface = blobSource,
                    MatchSurfaceTitle = titleSourceSp,
                    MatchSurfaceDesc = desc,
                    SubProgramIdentifier = ident
                });
            }
        }

        return outRows;
    }

    internal static string[] SplitKeywordPatterns(string? keyword)
    {
        var t = (keyword ?? "").Trim();
        if (t.Length == 0)
        {
            return Array.Empty<string>();
        }

        return t.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim().ToLowerInvariant())
            .Where(s => s.Length > 0)
            .ToArray();
    }

    internal static bool RowMatches(CatalogRow row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return true;
        }

        if (string.IsNullOrEmpty(row.MatchSurface))
        {
            return false;
        }

        // MatchHelper / FastMatcher parity: GetMatchResult on the full haystack (single-token path includes
        // substring contains on the entire text; IsMatch alone only scans the first MAX_LEN chars).
        var result = DesignerFastMatcher.GetMatchResult(row.MatchSurface, patterns);
        return result != null && result.IsMatch;
    }

    private static int EarliestLiteralTitleIndex(CatalogRow row, string pl)
    {
        var best = int.MaxValue;
        void Consider(string? s)
        {
            if (string.IsNullOrEmpty(s))
            {
                return;
            }

            var i = s.IndexOf(pl, StringComparison.OrdinalIgnoreCase);
            if (i >= 0 && i < best)
            {
                best = i;
            }
        }

        Consider(row.Label);
        if (row.Payload != null)
        {
            Consider(row.Payload.StepRunnerKey);
            Consider(row.Payload.Name);
            Consider(row.Payload.ControlFieldValue);
        }

        if (row.Kind == "subprogram")
        {
            Consider(row.SubProgramIdentifier);
        }

        return best == int.MaxValue ? -1 : best;
    }

    private static int EarliestLiteralDescIndex(CatalogRow row, string pl)
    {
        if (string.IsNullOrEmpty(row.Description))
        {
            return -1;
        }

        return row.Description.IndexOf(pl, StringComparison.OrdinalIgnoreCase);
    }

    private static int FirstMatchCharIndex(string? text, string pattern)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(pattern))
        {
            return int.MaxValue;
        }

        var r = DesignerFastMatcher.GetMatchResult(text, new[] { pattern });
        if (r == null)
        {
            return int.MaxValue;
        }

        var n = Math.Min(text.Length, DesignerFastMatcher.MaxMatchLength);
        for (var i = 0; i < n; i++)
        {
            if (r.GetPosition(i))
            {
                return i;
            }
        }

        return int.MaxValue;
    }

    /// <summary>
    /// Classify one keyword: tier 0 = literal title/identity … 4 = matched only on broader surface; earliness rewards earlier hits.
    /// </summary>
    private static void GetPatternTierAndEarliness(CatalogRow row, string p, out int tier, out int earliness)
    {
        if (p.Length == 0)
        {
            tier = 4;
            earliness = 0;
            return;
        }

        var litT = EarliestLiteralTitleIndex(row, p);
        if (litT >= 0)
        {
            tier = 0;
            earliness = 2000 - Math.Min(litT, 1999);
            return;
        }

        if (!string.IsNullOrEmpty(row.MatchSurfaceTitle) && DesignerFastMatcher.IsMatch(row.MatchSurfaceTitle, new[] { p }))
        {
            tier = 1;
            var ti = FirstMatchCharIndex(row.MatchSurfaceTitle, p);
            earliness = ti == int.MaxValue ? 0 : 800 - Math.Min(ti, 799);
            return;
        }

        var litD = EarliestLiteralDescIndex(row, p);
        if (litD >= 0)
        {
            tier = 2;
            earliness = 600 - Math.Min(litD, 599);
            return;
        }

        if (!string.IsNullOrEmpty(row.MatchSurfaceDesc) && DesignerFastMatcher.IsMatch(row.MatchSurfaceDesc, new[] { p }))
        {
            tier = 3;
            var di = FirstMatchCharIndex(row.MatchSurfaceDesc, p);
            earliness = di == int.MaxValue ? 0 : 400 - Math.Min(di, 399);
            return;
        }

        tier = 4;
        var fi = FirstMatchCharIndex(row.MatchSurface, p);
        earliness = fi == int.MaxValue ? 0 : 200 - Math.Min(fi, 199);
    }

    /// <summary>
    /// Single sort key: higher is better. Aligns with toolbox idea: coarse tier (min across keywords) + <see cref="DesignerFastMatcher"/> score on surface/label/desc + earliness.
    /// </summary>
    internal static long ComputeSortKey(CatalogRow row, string[] patterns)
    {
        if (patterns.Length == 0)
        {
            return 0;
        }

        if (string.IsNullOrEmpty(row.MatchSurface))
        {
            return long.MinValue;
        }

        var titleHaystack = string.IsNullOrEmpty(row.MatchSurfaceTitle) ? row.Label : row.MatchSurfaceTitle;
        var titleResult = string.IsNullOrEmpty(titleHaystack)
            ? null
            : DesignerFastMatcher.GetMatchResult(titleHaystack, patterns);
        var labelResult = string.IsNullOrEmpty(row.Label)
            ? null
            : DesignerFastMatcher.GetMatchResult(row.Label, patterns);
        var descResult = string.IsNullOrEmpty(row.MatchSurfaceDesc)
            ? null
            : DesignerFastMatcher.GetMatchResult(row.MatchSurfaceDesc, patterns);
        var fullResult = DesignerFastMatcher.GetMatchResult(row.MatchSurface, patterns);

        var titleEngine = Math.Max(Math.Max(0, titleResult?.Score ?? 0), Math.Max(0, labelResult?.Score ?? 0));
        var descEngine = Math.Max(0, descResult?.Score ?? 0);
        // MatchHelper.TryMultiMatchFast: prefer title over description; avoid full-blob score pushing weak hits up.
        var surfaceEngine = Math.Max(titleEngine, Math.Max(descEngine, Math.Max(0, fullResult?.Score ?? 0)));

        var minTier = 99;
        var earlinessSum = 0;
        foreach (var p in patterns)
        {
            if (p.Length == 0)
            {
                continue;
            }

            GetPatternTierAndEarliness(row, p, out var t, out var e);
            if (t < minTier)
            {
                minTier = t;
            }

            earlinessSum += e;
        }

        if (minTier > 4)
        {
            minTier = 4;
        }

        var labelMatchesAllPatterns = labelResult is { IsMatch: true }
            || (!string.IsNullOrEmpty(row.Label) && DesignerFastMatcher.IsMatch(row.Label, patterns));

        // Tier gap >> engine range (~1e3): multi-keyword “weakest” tier dominates (all in title beats one in description).
        var labelBonus = labelMatchesAllPatterns ? SortKeyLabelFullMatchBonus : 0L;
        return (long)(5 - minTier) * SortKeyTierScale
            + surfaceEngine * 10_000L
            + titleEngine * SortKeyLabelEngineMultiplier
            + descEngine * 50L
            + earlinessSum
            + labelBonus;
    }

    internal static int QuickInsertSortRankTier(CatalogRow row)
    {
        if (!string.Equals(row.Kind, "runner", StringComparison.Ordinal) || row.Payload is null)
        {
            return 2;
        }

        if (!string.IsNullOrWhiteSpace(row.Payload.ControlFieldValue))
        {
            return 2;
        }

        var id = row.Id ?? "";
        if (!id.StartsWith("r:", StringComparison.Ordinal))
        {
            return 1;
        }

        var rest = id.Length >= 2 ? id.Substring(2) : "";
        var pk = (row.Payload.StepRunnerKey ?? "").Trim();
        return rest.Length > 0 && string.Equals(rest, pk, StringComparison.Ordinal) ? 0 : 1;
    }

    private static List<(int Start, int End)> MergeAdjacentRuns(IReadOnlyList<int> positions)
    {
        if (positions.Count == 0)
        {
            return new List<(int Start, int End)>();
        }

        var sorted = positions.Distinct().OrderBy(x => x).ToList();
        var merged = new List<(int Start, int End)> { (sorted[0], sorted[0] + 1) };
        for (var i = 1; i < sorted.Count; i++)
        {
            var p = sorted[i];
            var last = merged[merged.Count - 1];
            if (p == last.End)
            {
                merged[merged.Count - 1] = (last.Start, last.End + 1);
            }
            else
            {
                merged.Add((p, p + 1));
            }
        }

        return merged;
    }

    private static List<(int Start, int End)> MergeHighlightIntervals(List<(int Start, int End)> intervals)
    {
        if (intervals.Count == 0)
        {
            return intervals;
        }

        var sorted = intervals.OrderBy(x => x.Start).ToList();
        var merged = new List<(int Start, int End)> { sorted[0] };
        for (var i = 1; i < sorted.Count; i++)
        {
            var cur = sorted[i];
            var last = merged[merged.Count - 1];
            if (cur.Start <= last.End)
            {
                merged[merged.Count - 1] = (last.Start, Math.Max(last.End, cur.End));
            }
            else
            {
                merged.Add(cur);
            }
        }

        return merged;
    }

    /// <summary>
    /// Prefer contiguous case-insensitive substring hits on <paramref name="text"/> (higher precision for keys like <c>sys:repeat</c>);
    /// falls back to <see cref="DesignerFastMatcher"/> when no literal substring matches.
    /// </summary>
    private static List<(int Start, int End)> HighlightRangesLiteralSubstringFirst(string text, string[] patterns)
    {
        var ranges = new List<(int Start, int End)>();
        foreach (var p in patterns)
        {
            if (string.IsNullOrEmpty(p))
            {
                continue;
            }

            var start = 0;
            while (start <= text.Length - p.Length)
            {
                var idx = text.IndexOf(p, start, StringComparison.OrdinalIgnoreCase);
                if (idx < 0)
                {
                    break;
                }

                ranges.Add((idx, idx + p.Length));
                start = idx + 1;
            }
        }

        if (ranges.Count > 0)
        {
            return MergeHighlightIntervals(ranges);
        }

        return HighlightRangesFromFastMatch(text, patterns);
    }

    private static string ToHighlightedHtmlFromRanges(string text, IReadOnlyList<(int Start, int End)> ranges)
    {
        if (ranges.Count == 0)
        {
            return WebUtility.HtmlEncode(text);
        }

        var sb = new StringBuilder();
        var cur = 0;
        foreach (var (s, e) in ranges)
        {
            if (s > cur)
            {
                sb.Append(WebUtility.HtmlEncode(text.Substring(cur, s - cur)));
            }

            if (e > s)
            {
                sb.Append("<mark>")
                    .Append(WebUtility.HtmlEncode(text.Substring(s, e - s)))
                    .Append("</mark>");
            }

            cur = e;
        }

        if (cur < text.Length)
        {
            sb.Append(WebUtility.HtmlEncode(text.Substring(cur)));
        }

        return sb.ToString();
    }

    /// <summary>Runner key highlight: literal substring first, then DesignerFastMatcher.</summary>
    private static string ToHighlightedHtmlPreferLiteralSubstring(string? text, string[] patterns)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        if (patterns == null || patterns.Length == 0)
        {
            return WebUtility.HtmlEncode(text);
        }

        var ranges = HighlightRangesLiteralSubstringFirst(text, patterns);
        return ToHighlightedHtmlFromRanges(text, ranges);
    }

    private static List<(int Start, int End)> HighlightRangesFromFastMatch(string? text, string[] patterns)
    {
        if (string.IsNullOrEmpty(text) || patterns == null || patterns.Length == 0)
        {
            return new List<(int Start, int End)>();
        }

        var r = DesignerFastMatcher.GetMatchResult(text, patterns);
        if (r == null)
        {
            return new List<(int Start, int End)>();
        }

        var hits = new List<int>();
        var n = Math.Min(text.Length, DesignerFastMatcher.MaxMatchLength);
        for (var i = 0; i < n; i++)
        {
            if (r.GetPosition(i))
            {
                hits.Add(i);
            }
        }

        return MergeAdjacentRuns(hits);
    }

    /// <summary>
    /// HTML for list rows: HTML-escaped text with matched spans from <see cref="DesignerFastMatcher"/> wrapped in <c>&lt;mark&gt;</c>.
    /// </summary>
    internal static string ToHighlightedHtml(string? text, string[] patterns)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        if (patterns == null || patterns.Length == 0)
        {
            return WebUtility.HtmlEncode(text);
        }

        var ranges = HighlightRangesFromFastMatch(text, patterns);
        if (ranges.Count == 0)
        {
            return WebUtility.HtmlEncode(text);
        }

        var sb = new StringBuilder();
        var cur = 0;
        foreach (var (s, e) in ranges)
        {
            if (s > cur)
            {
                sb.Append(WebUtility.HtmlEncode(text.Substring(cur, s - cur)));
            }

            if (e > s)
            {
                sb.Append("<mark>")
                    .Append(WebUtility.HtmlEncode(text.Substring(s, e - s)))
                    .Append("</mark>");
            }

            cur = e;
        }

        if (cur < text.Length)
        {
            sb.Append(WebUtility.HtmlEncode(text.Substring(cur)));
        }

        return sb.ToString();
    }

    private static bool PatternHitsRunnerDisplayNameOnly(CatalogRow row, string p)
    {
        if (p.Length == 0 || string.IsNullOrEmpty(row.Label))
        {
            return false;
        }

        if (row.Label.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return true;
        }

        return DesignerFastMatcher.IsMatch(row.Label, new[] { p });
    }

    private static bool IsParentModuleRunnerRow(CatalogRow row) =>
        string.Equals(row.Kind, "runner", StringComparison.Ordinal)
        && row.Payload != null
        && string.IsNullOrEmpty(row.Payload.ControlFieldValue);

    private static string[] SplitKeywordLineTokens(string? matchKeywords)
    {
        if (string.IsNullOrWhiteSpace(matchKeywords))
        {
            return Array.Empty<string>();
        }

        return matchKeywords
            .Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(t => t.Trim())
            .Where(t => t.Length > 0)
            .ToArray();
    }

    private static bool IsExactKeywordTokenMatch(string? matchKeywords, string p)
    {
        if (p.Length == 0)
        {
            return false;
        }

        return SplitKeywordLineTokens(matchKeywords).Any(t => t.Equals(p, StringComparison.OrdinalIgnoreCase));
    }

    private static bool PatternMatchesRunnerKeyLiteralOrFast(string pk, string p)
    {
        if (pk.Length == 0 || p.Length == 0)
        {
            return false;
        }

        if (pk.IndexOf(p, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return true;
        }

        return DesignerFastMatcher.IsMatch(pk, new[] { p });
    }

    /// <summary>
    /// Parent module row: keyword token exact match (counts as title match) → <c>title (only that keyword)</c>;
    /// key match → <c>title (&lt;highlighted stepRunnerKey&gt;)</c> (no duplicate raw key prefix); partial keyword → <c>title (matched tokens only)</c>.
    /// </summary>
    private static string BuildParentRunnerLabelHtml(CatalogRow row, string[] hp)
    {
        var mk = row.MatchKeywords ?? "";
        var pk = row.Payload?.StepRunnerKey ?? "";
        var label = row.Label ?? "";

        // 1) Full token match on [Step(KeyWords=…)] line counts as title match: show only that keyword token(s), not entire line.
        var exactTokensForParen = new List<string>();
        var seenExact = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in hp)
        {
            if (p.Length == 0)
            {
                continue;
            }

            if (!IsExactKeywordTokenMatch(mk, p))
            {
                continue;
            }

            if (PatternHitsRunnerDisplayNameOnly(row, p))
            {
                continue;
            }

            var tokenFromLine = SplitKeywordLineTokens(mk).FirstOrDefault(t => t.Equals(p, StringComparison.OrdinalIgnoreCase));
            if (tokenFromLine == null || !seenExact.Add(tokenFromLine))
            {
                continue;
            }

            exactTokensForParen.Add(tokenFromLine);
        }

        if (exactTokensForParen.Count > 0)
        {
            var inner = string.Join(" ", exactTokensForParen.Select(t => "<mark>" + WebUtility.HtmlEncode(t) + "</mark>"));
            return WebUtility.HtmlEncode(label) + " (" + inner + ")";
        }

        // 2) StepRunnerKey: literal substring first, then show title(stepRunnerKey:highlightedKey)
        foreach (var p in hp)
        {
            if (p.Length == 0)
            {
                continue;
            }

            if (PatternHitsRunnerDisplayNameOnly(row, p))
            {
                continue;
            }

            if (IsExactKeywordTokenMatch(mk, p))
            {
                continue;
            }

            if (PatternMatchesRunnerKeyLiteralOrFast(pk, p))
            {
                // keyHl is already HTML for the full stepRunnerKey (literal substring + DesignerFastMatcher).
                // Do not prefix HtmlEncode(pk) + ":" — that duplicates the key when the whole pk matches.
                var keyHl = ToHighlightedHtmlPreferLiteralSubstring(pk, hp);
                return WebUtility.HtmlEncode(label) + " (" + keyHl + ")";
            }
        }

        // 3) Partial keyword hits on individual tokens only (omit non-matching keywords).
        var partialTokens = new List<string>();
        var seenTok = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var t in SplitKeywordLineTokens(mk))
        {
            if (!seenTok.Add(t))
            {
                continue;
            }

            var isExact = hp.Any(p => p.Length > 0 && t.Equals(p, StringComparison.OrdinalIgnoreCase));
            if (isExact)
            {
                continue;
            }

            var hit = false;
            foreach (var p in hp)
            {
                if (p.Length == 0 || PatternHitsRunnerDisplayNameOnly(row, p))
                {
                    continue;
                }

                if (DesignerFastMatcher.IsMatch(t, new[] { p }))
                {
                    hit = true;
                    break;
                }
            }

            if (hit)
            {
                partialTokens.Add(t);
            }
        }

        if (partialTokens.Count > 0)
        {
            var inner = string.Join(" ", partialTokens.Select(t => ToHighlightedHtml(t, hp)));
            return WebUtility.HtmlEncode(label) + " (" + inner + ")";
        }

        return ToHighlightedHtml(label, hp);
    }

    internal static object ToJsonItem(CatalogRow row, string[] highlightPatterns)
    {
        var hp = highlightPatterns ?? Array.Empty<string>();
        if (row.Kind == "subprogram")
        {
            return new
            {
                kind = "subprogram",
                row.Id,
                row.Label,
                labelHtml = ToHighlightedHtml(row.Label, hp),
                description = row.Description,
                descriptionHtml = ToHighlightedHtml(row.Description, hp),
                subProgramIdentifier = row.SubProgramIdentifier ?? ""
            };
        }

        var labelHtml = IsParentModuleRunnerRow(row) && hp.Length > 0
            ? BuildParentRunnerLabelHtml(row, hp)
            : ToHighlightedHtml(row.Label, hp);
        return new
        {
            kind = "runner",
            row.Id,
            row.Label,
            labelHtml,
            description = row.Description,
            descriptionHtml = ToHighlightedHtml(row.Description, hp),
            payload = row.Payload
        };
    }
}

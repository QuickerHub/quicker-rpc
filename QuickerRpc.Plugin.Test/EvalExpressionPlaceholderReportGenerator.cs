using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Generates a human-readable HTML report for sys:evalexpression placeholder rewriting.
/// Run: dotnet test QuickerRpc.Plugin.Test --filter GenerateEvalExpressionPlaceholderReport
/// </summary>
[TestClass]
public sealed class EvalExpressionPlaceholderReportGenerator
{
    private sealed record ReportCase(
        string Title,
        string OriginalExpression,
        IReadOnlyList<string> DefinedVariables,
        string Notes);

    [TestMethod]
    public void GenerateEvalExpressionPlaceholderReport()
    {
        var cases = new[]
        {
            new ReportCase(
                "已声明变量 → v_ 前缀",
                "new[] {\"\\r\\n\",\"\\n\",\"\\r\"}.Contains({lineEnding}) + {realVariable}",
                ["lineEnding", "realVariable"],
                "仅 lineEnding、realVariable 在动作变量表中声明，应被替换。"),
            new ReportCase(
                "未声明占位符保留（含字符串字面量内）",
                "\"{notVariable}\" + @\"{alsoNotVariable}\" + {realVariable}",
                ["realVariable"],
                "notVariable / alsoNotVariable 未声明，即使出现在字符串中也必须保持 {…} 原样。"),
            new ReportCase(
                "C# 数组初始化字面量不受影响",
                "var lines = {clipText}.Split(new[] { \"\\r\\n\", \"\\r\", \"\\n\" }, StringSplitOptions.None)",
                ["clipText"],
                "new[] { \"\\r\\n\", … } 是 C# 语法，不是 Quicker 变量占位符。"),
            new ReportCase(
                "未声明 {ab} 不应替换",
                "{definedVar} + \"{ab}\" + {ab}",
                ["definedVar"],
                "ab 未在变量表声明：两处 {ab} 均保持原样；definedVar 替换为 v_definedVar。"),
            new ReportCase(
                "正则 \\p{L} 不受影响",
                "Regex.IsMatch({text}, @\"[\\p{L}\\p{N}_]+\")",
                ["text"],
                "Unicode 属性转义 \\p{L} 不含 {varKey} 占位符形式。"),
            new ReportCase(
                "重复占位符去重绑定",
                "{definedVar} + {definedVar}",
                ["definedVar"],
                "同一已声明变量多次出现，只绑定一次 v_definedVar。"),
            new ReportCase(
                "Unicode 变量名",
                "{输出结果}.Trim() + {count}",
                ["输出结果", "count"],
                "占位符支持 Unicode 标识符（\\w+）。"),
            new ReportCase(
                "内置 quicker_in_param",
                "{quicker_in_param}.Length",
                [],
                "quicker_in_param 为内置键，即使未写入变量表也会替换。"),
        };

        var itemsHtml = new StringBuilder();
        for (var i = 0; i < cases.Length; i++)
        {
            itemsHtml.Append(RenderCase(i + 1, cases[i]));
        }

        var generatedAt = DateTimeOffset.Now.ToString("yyyy-MM-dd HH:mm:ss zzz");
        var html = $@"<!DOCTYPE html>
<html lang=""zh-CN"">
<head>
  <meta charset=""utf-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1"" />
  <title>sys:evalexpression 占位符替换报告</title>
  <style>
    :root {{
      --bg: #0f1419;
      --card: #1a2332;
      --border: #2d3a4d;
      --text: #e7ecf3;
      --muted: #8b9cb3;
      --accent: #5b9cf5;
      --ok: #3dd68c;
      --warn: #f5a623;
      --code-bg: #0d1117;
    }}
    @media (prefers-color-scheme: light) {{
      :root {{
        --bg: #f4f6f9;
        --card: #ffffff;
        --border: #d8dee9;
        --text: #1a2332;
        --muted: #5c6b7f;
        --accent: #2563eb;
        --ok: #059669;
        --warn: #d97706;
        --code-bg: #f1f5f9;
      }}
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ""Segoe UI"", system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 2rem 1rem 3rem;
    }}
    .wrap {{ max-width: 960px; margin: 0 auto; }}
    h1 {{ font-size: 1.5rem; margin: 0 0 0.25rem; }}
    .meta {{ color: var(--muted); font-size: 0.875rem; margin-bottom: 2rem; }}
    .item {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.25rem 1.5rem;
      margin-bottom: 1.25rem;
    }}
    .item h2 {{
      font-size: 1rem;
      margin: 0 0 0.75rem;
      color: var(--accent);
    }}
    .note {{
      font-size: 0.8125rem;
      color: var(--muted);
      margin-bottom: 1rem;
    }}
    dl {{ margin: 0; display: grid; gap: 0.75rem; }}
    dt {{
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 0.25rem;
    }}
    dd {{ margin: 0; }}
    pre {{
      margin: 0;
      padding: 0.75rem 1rem;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow-x: auto;
      font-family: Consolas, ""Cascadia Code"", monospace;
      font-size: 0.8125rem;
      white-space: pre-wrap;
      word-break: break-word;
    }}
    .vars {{
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }}
    .tag {{
      font-size: 0.75rem;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ok) 18%, transparent);
      border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
      color: var(--ok);
      font-family: Consolas, monospace;
    }}
    .tag.builtin {{
      background: color-mix(in srgb, var(--warn) 18%, transparent);
      border-color: color-mix(in srgb, var(--warn) 40%, transparent);
      color: var(--warn);
    }}
    .tag.empty {{ opacity: 0.6; font-style: italic; }}
    .bound {{
      margin-top: 0.75rem;
      font-size: 0.8125rem;
      color: var(--muted);
    }}
    .bound code {{ color: var(--text); }}
  </style>
</head>
<body>
  <div class=""wrap"">
    <h1>sys:evalexpression 占位符替换报告</h1>
    <p class=""meta"">
      规则：仅动作已声明变量 + 内置 <code>quicker_in_param</code> 的 <code>{{varKey}}</code> 会替换为 <code>v_varKey</code>；
      算法对齐 QuickerPc <code>EvalExpressionStepV2</code>（≤16 变量按 key 扫描，否则 regex 单遍）；
      生成于 {WebUtility.HtmlEncode(generatedAt)} · 引擎 <code>ExpressionVariablePlaceholder</code>
    </p>
    {itemsHtml}
  </div>
</body>
</html>";

        var repoRoot = FindRepoRoot();
        var outDir = Path.Combine(repoRoot, ".local");
        Directory.CreateDirectory(outDir);
        var outPath = Path.Combine(outDir, "evalexpression-placeholder-report.html");
        File.WriteAllText(outPath, html, Encoding.UTF8);

        TestContext.WriteLine($"Report written: {outPath}");
        Assert.IsTrue(File.Exists(outPath));
    }

    private static string RenderCase(int index, ReportCase reportCase)
    {
        var definedKeys = BuildDefinedKeySet(reportCase.DefinedVariables);
        var bound = new Dictionary<string, object?>(StringComparer.Ordinal);
        var replaced = ExpressionVariablePlaceholder.Replace(
            reportCase.OriginalExpression,
            definedKeys,
            key => $"<{key}>",
            (name, value) => bound[name] = value);
        replaced = ExpressionEvalTransforms.EnsureTypedSplitAssignment(replaced);

        var varsHtml = new StringBuilder();
        if (reportCase.DefinedVariables.Count == 0)
        {
            varsHtml.Append("<span class=\"tag empty\">（无声明变量，仅内置键）</span>");
        }
        else
        {
            foreach (var key in reportCase.DefinedVariables)
            {
                varsHtml.Append("<span class=\"tag\">")
                    .Append(WebUtility.HtmlEncode(key))
                    .Append("</span>");
            }
        }

        varsHtml.Append("<span class=\"tag builtin\">quicker_in_param</span>");

        var boundSummary = bound.Count == 0
            ? "（无 v_* 绑定）"
            : string.Join(", ", bound.Keys);

        return $@"
    <article class=""item"">
      <h2>#{index} {WebUtility.HtmlEncode(reportCase.Title)}</h2>
      <p class=""note"">{WebUtility.HtmlEncode(reportCase.Notes)}</p>
      <dl>
        <div>
          <dt>原始表达式</dt>
          <dd><pre>{WebUtility.HtmlEncode(reportCase.OriginalExpression)}</pre></dd>
        </div>
        <div>
          <dt>变量定义（动作 Variables + 内置）</dt>
          <dd><div class=""vars"">{varsHtml}</div></dd>
        </div>
        <div>
          <dt>替换后表达式</dt>
          <dd><pre>{WebUtility.HtmlEncode(replaced)}</pre></dd>
        </div>
      </dl>
      <p class=""bound"">Z.Expressions 绑定：<code>{WebUtility.HtmlEncode(boundSummary)}</code></p>
    </article>";
    }

    private static HashSet<string> BuildDefinedKeySet(IReadOnlyList<string> definedVariables)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            ExpressionVariablePlaceholder.QuickerInParamKey,
        };
        foreach (var key in definedVariables)
        {
            keys.Add(key);
        }

        return keys;
    }

    private static string FindRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "QuickerRpc.sln"))
                || File.Exists(Path.Combine(dir, "build.ps1")))
            {
                return dir;
            }

            dir = Directory.GetParent(dir)?.FullName ?? string.Empty;
        }

        return Directory.GetCurrentDirectory();
    }

    public TestContext? TestContext { get; set; }
}

using System;
using System.Linq;
using System.Net;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Resolves getquicker action page intro HTML (SharedActionVm.Detail) for publish/review.</summary>
public static class ActionPublishIntro
{
  /// <summary>Returns trimmed Detail HTML when present; ignores deprecated share note.</summary>
  public static string? ResolveDetailHtml(string? detailHtml, string? note = null)
  {
    _ = note;
    return string.IsNullOrWhiteSpace(detailHtml) ? null : detailHtml.Trim();
  }

  /// <summary>Wrap plain text in paragraph tags; pass through strings that already look like HTML.</summary>
  public static string? NoteToDetailHtml(string? note)
  {
    if (string.IsNullOrWhiteSpace(note))
    {
      return null;
    }

    var trimmed = note.Trim();
    if (trimmed.StartsWith("<", StringComparison.Ordinal))
    {
      return trimmed;
    }

    var blocks = trimmed.Split(new[] { "\r\n\r\n", "\n\n" }, StringSplitOptions.None);
    return string.Concat(blocks.Select(block =>
    {
      var encoded = WebUtility.HtmlEncode(block.Trim());
      var withBreaks = encoded.Replace("\r\n", "<br/>").Replace("\n", "<br/>");
      return "<p>" + withBreaks + "</p>";
    }));
  }
}

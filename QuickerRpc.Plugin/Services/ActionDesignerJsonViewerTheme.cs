using System;
using System.IO;
using System.Xml;
using System.Windows;
using System.Windows.Media;
using ICSharpCode.AvalonEdit;
using ICSharpCode.AvalonEdit.Highlighting;
using ICSharpCode.AvalonEdit.Highlighting.Xshd;
using Microsoft.Win32;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Light/dark chrome and JSON syntax colors for <see cref="ActionDesignerJsonViewerWindow"/>.
/// </summary>
internal static class ActionDesignerJsonViewerTheme
{
    private const string DarkJsonHighlightingName = "QuickerRpc.JsonDark.v2";

    private static readonly SolidColorBrush LightBackground = Brushes.White;
    private static readonly SolidColorBrush LightForeground = Brushes.Black;
    private static readonly SolidColorBrush LightLineNumbers = new(Color.FromRgb(0x2b, 0x91, 0xaf));

    private static readonly SolidColorBrush DarkBackground = new(Color.FromRgb(0x1e, 0x1e, 0x1e));
    private static readonly SolidColorBrush DarkForeground = new(Color.FromRgb(0xee, 0xee, 0xee));
    private static readonly SolidColorBrush DarkLineNumbers = new(Color.FromRgb(0x9a, 0x9a, 0x9a));
    private static readonly SolidColorBrush DarkChrome = new(Color.FromRgb(0x25, 0x25, 0x26));

    private static readonly object RegisterLock = new();
    private static IHighlightingDefinition? _cachedDarkHighlighting;

    // VS Code Dark+ inspired; property keys before generic strings; no fallback to built-in JSON.
    private const string DarkJsonXshd =
        """
        <?xml version="1.0"?>
        <SyntaxDefinition name="QuickerRpc.JsonDark.v2" xmlns="http://icsharpcode.net/sharpdevelop/syntaxdefinition/2008">
          <Color name="DefaultText" foreground="#EEEEEE" />
          <Color name="PropertyName" foreground="#9CDCFE" fontWeight="normal" />
          <Color name="StringValue" foreground="#CE9178" />
          <Color name="Number" foreground="#B5CEA8" />
          <Color name="Keyword" foreground="#4FC9B0" fontWeight="bold" />
          <Color name="Punctuation" foreground="#DCDCDC" />
          <RuleSet>
            <Rule color="PropertyName">
              "([^"\\]|\\.)*"\s*(?=:)
            </Rule>
            <Rule color="Keyword">
              \b(true|false|null)\b
            </Rule>
            <Rule color="Number">
              \b-?(0[xX][0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)\b
            </Rule>
            <Rule color="StringValue">
              "([^"\\]|\\.)*"
            </Rule>
            <Rule color="Punctuation">
              [{}[\],:]
            </Rule>
          </RuleSet>
        </SyntaxDefinition>
        """;

    public static bool IsDarkTheme(Window? owner) =>
        TryIsDarkBackground(owner?.Background) || IsWindowsAppsDarkTheme();

    public static void ApplyWindow(Window window, Window? owner)
    {
        if (!IsDarkTheme(owner))
        {
            return;
        }

        window.Background = DarkChrome;
        window.Foreground = DarkForeground;
    }

    public static void ApplyEditor(TextEditor editor, Window? owner)
    {
        if (IsDarkTheme(owner))
        {
            ApplyDark(editor);
            return;
        }

        ApplyLight(editor);
    }

    private static void ApplyLight(TextEditor editor)
    {
        editor.Background = LightBackground;
        editor.Foreground = LightForeground;
        editor.LineNumbersForeground = LightLineNumbers;
        editor.SyntaxHighlighting =
            HighlightingManager.Instance.GetDefinition("JSON")
            ?? HighlightingManager.Instance.GetDefinition("JavaScript");
    }

    private static void ApplyDark(TextEditor editor)
    {
        editor.Background = DarkBackground;
        editor.Foreground = DarkForeground;
        editor.LineNumbersForeground = DarkLineNumbers;

        // Never fall back to Quicker's built-in JSON/JS themes — they use dark-on-dark keyword colors.
        editor.SyntaxHighlighting = GetOrRegisterDarkJsonHighlighting();
    }

    private static IHighlightingDefinition? GetOrRegisterDarkJsonHighlighting()
    {
        if (_cachedDarkHighlighting is not null)
        {
            return _cachedDarkHighlighting;
        }

        var existing = HighlightingManager.Instance.GetDefinition(DarkJsonHighlightingName);
        if (existing is not null)
        {
            _cachedDarkHighlighting = existing;
            return existing;
        }

        lock (RegisterLock)
        {
            if (_cachedDarkHighlighting is not null)
            {
                return _cachedDarkHighlighting;
            }

            existing = HighlightingManager.Instance.GetDefinition(DarkJsonHighlightingName);
            if (existing is not null)
            {
                _cachedDarkHighlighting = existing;
                return existing;
            }

            try
            {
                using var xml = XmlReader.Create(new StringReader(DarkJsonXshd));
                var definition = HighlightingLoader.Load(xml, HighlightingManager.Instance);
                HighlightingManager.Instance.RegisterHighlighting(
                    DarkJsonHighlightingName,
                    new[] { ".json" },
                    definition);
                _cachedDarkHighlighting = definition;
                return definition;
            }
            catch
            {
                return null;
            }
        }
    }

    private static bool TryIsDarkBackground(Brush? brush)
    {
        if (brush is not SolidColorBrush solid)
        {
            return false;
        }

        var c = solid.Color;
        if (c.A == 0)
        {
            return false;
        }

        var luminance = (0.2126 * c.R + 0.7152 * c.G + 0.0722 * c.B) / 255.0;
        return luminance < 0.45;
    }

    private static bool IsWindowsAppsDarkTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            var value = key?.GetValue("AppsUseLightTheme");
            return value is int theme && theme == 0;
        }
        catch
        {
            return false;
        }
    }
}

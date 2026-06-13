using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Binds injected designer UI to Quicker / HandyControl theme brushes (light + dark).
/// </summary>
internal static class ActionDesignerTheme
{
    public static void TrySetResourceReference(FrameworkElement element, DependencyProperty property, string resourceKey)
    {
        try
        {
            element.SetResourceReference(property, resourceKey);
        }
        catch
        {
            // Older Quicker builds may omit a key; caller keeps explicit fallbacks when needed.
        }
    }

    public static void ApplyPageSurface(Border border)
    {
        TrySetResourceReference(border, Border.BackgroundProperty, "SecondaryRegionBrush");
    }

    public static void ApplyCardSurface(Border border)
    {
        TrySetResourceReference(border, Border.BackgroundProperty, "RegionBrush");
        TrySetResourceReference(border, Border.BorderBrushProperty, "BorderBrush");
    }

    public static void ApplySectionTitle(TextBlock text)
    {
        TrySetResourceReference(text, TextBlock.ForegroundProperty, "SecondaryTextBrush");
    }

    public static void ApplyDivider(Border divider)
    {
        TrySetResourceReference(divider, Border.BackgroundProperty, "BorderBrush");
    }

    public static void ApplyChipButton(Button button)
    {
        TrySetResourceReference(button, Control.BackgroundProperty, "SecondaryRegionBrush");
        TrySetResourceReference(button, Control.BorderBrushProperty, "BorderBrush");
        TrySetResourceReference(button, Control.ForegroundProperty, "PrimaryTextBrush");
    }

    public static void ApplyPrimaryButton(Button button)
    {
        TrySetResourceReference(button, Control.BackgroundProperty, "PrimaryBrush");
        TrySetResourceReference(button, Control.BorderBrushProperty, "PrimaryBrush");
        button.Foreground = Brushes.White;
    }

    public static void ApplyTabHeaderIcon(Shape shape)
    {
        TrySetResourceReference(shape, Shape.FillProperty, "PrimaryTextBrush");
    }
}

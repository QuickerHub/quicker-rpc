using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Shapes;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Renders Quicker <c>fa:</c> icon specs for injected designer tool buttons.
/// </summary>
internal static class ActionDesignerFaIcon
{
    private const double DefaultSize = 16;

    public static UIElement? TryCreate(string? faSpec, double size = DefaultSize)
    {
        if (string.IsNullOrWhiteSpace(faSpec))
        {
            return null;
        }

        try
        {
            var service = AppServices.GetRequired<FontAwesomeIconSearchService>();
            if (!service.TryResolveGeometry(faSpec, out var geometry, out _) || geometry is null)
            {
                return null;
            }

            var path = new Path
            {
                Stretch = Stretch.Uniform,
                Data = Geometry.Parse(geometry.Path),
            };

            if (TryParseBrush(geometry.Color) is { } brush)
            {
                path.Fill = brush;
            }
            else
            {
                path.SetBinding(
                    Shape.FillProperty,
                    new Binding("Foreground")
                    {
                        RelativeSource = new RelativeSource(RelativeSourceMode.FindAncestor, typeof(Button), 1),
                    });
            }

            return new Viewbox
            {
                Width = size,
                Height = size,
                VerticalAlignment = VerticalAlignment.Center,
                Child = path,
            };
        }
        catch (Exception ex)
        {
            System.Diagnostics.Trace.TraceWarning(
                "[QuickerRpc.Plugin] ActionDesignerFaIcon.TryCreate failed for '{0}': {1}",
                faSpec,
                ex.Message);
            return null;
        }
    }

    private static Brush? TryParseBrush(string? color)
    {
        if (string.IsNullOrWhiteSpace(color))
        {
            return null;
        }

        try
        {
            var converted = ColorConverter.ConvertFromString(color.Trim());
            if (converted is Color c)
            {
                return new SolidColorBrush(c);
            }
        }
        catch
        {
            // Fall back to button foreground binding.
        }

        return null;
    }
}

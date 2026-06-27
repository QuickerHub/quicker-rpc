using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Icon-only header for the injected designer <see cref="TabItem"/> (matches vertical icon tabs).
/// </summary>
internal static class ActionDesignerTabHeader
{
    private const double IconSize = 16;

    public static UIElement Create()
    {
        var icon = new Viewbox
        {
            Width = IconSize,
            Height = IconSize,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
            Child = new Path
            {
                Stretch = Stretch.Uniform,
                Data = Geometry.Parse(
                    "M8,2 L14,2 C15.1,2 16,2.9 16,4 L16,10 C16,11.1 15.1,12 14,12 L11,12 L11,14 L13,16 L5,16 L7,14 L7,12 L4,12 C2.9,12 2,11.1 2,10 L2,4 C2,2.9 2.9,2 4,2 Z"),
            },
        };

        if (icon.Child is Path path)
        {
            ActionDesignerTheme.ApplyTabHeaderIcon(path);
        }

        ToolTipService.SetToolTip(icon, "QuickerRpc 开发工具");
        return icon;
    }
}

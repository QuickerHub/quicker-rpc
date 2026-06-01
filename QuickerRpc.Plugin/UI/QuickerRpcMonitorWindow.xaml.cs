using System;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.UI;

public partial class QuickerRpcMonitorWindow : Window
{
    private readonly ActionEditService _actionEdit;
    private readonly Action<QuickerRpcMonitorWindow> _onClosed;

    public QuickerRpcMonitorWindow(ActionEditService actionEdit, Action<QuickerRpcMonitorWindow> onClosed)
    {
        _actionEdit = actionEdit;
        _onClosed = onClosed;
        InitializeComponent();
        Closed += (_, _) => _onClosed(this);
    }

    public event EventHandler? RefreshRequested;

    public void ApplySnapshot(ActionMonitorSnapshot snapshot, string pluginVersion, bool rpcClientConnected)
    {
        AgentGrid.ItemsSource = snapshot.AgentActions.Select(static a => new ActionMonitorRow(a)).ToList();
        RecentGrid.ItemsSource = snapshot.RecentlyEdited.Select(static a => new ActionMonitorRow(a)).ToList();

        var rpcText = rpcClientConnected ? "RPC 客户端已连接" : "RPC 客户端未连接";
        HeaderStatusText.Text =
            $"v{pluginVersion} · {rpcText} · Agent {snapshot.AgentActions.Count} · 最近 {snapshot.RecentlyEdited.Count}";

        var errors = new[]
        {
            snapshot.AgentError is { Length: > 0 } ? $"Agent: {snapshot.AgentError}" : null,
            snapshot.RecentError is { Length: > 0 } ? $"最近: {snapshot.RecentError}" : null,
        };
        var errorLine = string.Join(" · ", Array.FindAll(errors, static e => e is not null));
        FooterStatusText.Text = string.IsNullOrEmpty(errorLine)
            ? $"上次刷新：{snapshot.RefreshedAt:yyyy-MM-dd HH:mm:ss}"
            : $"上次刷新：{snapshot.RefreshedAt:yyyy-MM-dd HH:mm:ss} · {errorLine}";
    }

    public void SetFooterMessage(string message) => FooterStatusText.Text = message;

    public QuickerRpcActionSummaryItem? GetSelectedItem()
    {
        var grid = MainTabs.SelectedIndex == 0 ? AgentGrid : RecentGrid;
        return (grid.SelectedItem as ActionMonitorRow)?.Item;
    }

    private void OnRefreshClick(object sender, RoutedEventArgs e) =>
        RefreshRequested?.Invoke(this, EventArgs.Empty);

    private void OnEditClick(object sender, RoutedEventArgs e)
    {
        var item = GetSelectedItem();
        if (item is null)
        {
            MessageBox.Show(this, "请先选择一条动作。", Title, MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var result = _actionEdit.EditAction(item.ActionId);
        if (!result.Ok)
        {
            MessageBox.Show(this, result.Message ?? "无法打开编辑器。", Title, MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void OnCopyIdClick(object sender, RoutedEventArgs e)
    {
        var item = GetSelectedItem();
        if (item is null || string.IsNullOrWhiteSpace(item.ActionId))
        {
            MessageBox.Show(this, "请先选择一条动作。", Title, MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        ScheduleCopyActionId(item.ActionId, item.Title);
    }

    private void OnGridPreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left)
        {
            return;
        }

        var source = e.OriginalSource as DependencyObject;
        if (!IsActionIdCell(source))
        {
            return;
        }

        e.Handled = true;
        if (FindAncestor<DataGridRow>(source) is not { } gridRow
            || gridRow.Item is not ActionMonitorRow monitorRow
            || string.IsNullOrWhiteSpace(monitorRow.ActionId))
        {
            return;
        }

        gridRow.IsSelected = true;
        gridRow.Focus();
        ScheduleCopyActionId(monitorRow.ActionId, monitorRow.Title);
    }

    private void ScheduleCopyActionId(string actionId, string? titleForFooter = null)
    {
        // Defer past PreviewMouse* so DataGrid / context menu release any clipboard lock.
        Dispatcher.BeginInvoke(
            () => CopyActionId(actionId, titleForFooter),
            System.Windows.Threading.DispatcherPriority.Background);
    }

    private void CopyActionId(string actionId, string? titleForFooter = null)
    {
        var footer = string.IsNullOrWhiteSpace(titleForFooter)
            ? "已复制 ActionId"
            : $"已复制 ActionId：{titleForFooter}";

        if (!ClipboardSta.TrySetText(actionId, out var error, onSuccess: () => FooterStatusText.Text = footer))
        {
            MessageBox.Show(this, error ?? "复制失败", "复制失败", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void OnCopyMetadataClick(object sender, RoutedEventArgs e)
    {
        var item = GetSelectedItem();
        if (item is null || string.IsNullOrWhiteSpace(item.ActionId))
        {
            MessageBox.Show(this, "请先选择一条动作。", Title, MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var title = item.Title;
        var json = BuildActionMetadataJson(item);
        Dispatcher.BeginInvoke(
            () =>
            {
                if (!ClipboardSta.TrySetText(
                        json,
                        out var error,
                        onSuccess: () => FooterStatusText.Text = $"已复制动作元数据：{title}"))
                {
                    MessageBox.Show(this, error ?? "复制失败", "复制失败", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            },
            System.Windows.Threading.DispatcherPriority.Background);
    }

    private void OnGridDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left)
        {
            return;
        }

        if (IsActionIdCell(e.OriginalSource as DependencyObject))
        {
            return;
        }

        OnEditClick(sender, e);
    }

    private void OnGridPreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (FindAncestor<DataGridRow>(e.OriginalSource as DependencyObject) is { } row)
        {
            row.IsSelected = true;
            row.Focus();
        }
    }

    private static bool IsActionIdCell(DependencyObject? source)
    {
        while (source is not null)
        {
            if (source is FrameworkElement { Tag: string tag }
                && string.Equals(tag, "ActionIdCopy", StringComparison.Ordinal))
            {
                return true;
            }

            source = VisualTreeHelper.GetParent(source);
        }

        return false;
    }

    private static T? FindAncestor<T>(DependencyObject? current)
        where T : DependencyObject
    {
        while (current is not null)
        {
            if (current is T match)
            {
                return match;
            }

            current = VisualTreeHelper.GetParent(current);
        }

        return null;
    }

    private static string BuildActionMetadataJson(QuickerRpcActionSummaryItem item)
    {
        var builder = new StringBuilder();
        builder.Append('{');
        AppendJsonProperty(builder, "actionId", item.ActionId, first: true);
        AppendJsonProperty(builder, "title", item.Title);
        AppendJsonProperty(builder, "profileName", item.ProfileName);
        AppendJsonProperty(builder, "exeFile", item.ExeFile);
        AppendJsonProperty(builder, "lastEditTimeUtc", item.LastEditTimeUtc);
        builder.Append('}');
        return builder.ToString();
    }

    private static void AppendJsonProperty(StringBuilder builder, string name, string? value, bool first = false)
    {
        if (!first)
        {
            builder.Append(',');
        }

        builder.Append('"');
        builder.Append(EscapeJsonString(name));
        builder.Append("\":");

        if (value is null)
        {
            builder.Append("null");
            return;
        }

        builder.Append('"');
        builder.Append(EscapeJsonString(value));
        builder.Append('"');
    }

    private static string EscapeJsonString(string value)
    {
        var builder = new StringBuilder(value.Length + 8);
        foreach (var ch in value)
        {
            switch (ch)
            {
                case '\\':
                    builder.Append("\\\\");
                    break;
                case '"':
                    builder.Append("\\\"");
                    break;
                case '\b':
                    builder.Append("\\b");
                    break;
                case '\f':
                    builder.Append("\\f");
                    break;
                case '\n':
                    builder.Append("\\n");
                    break;
                case '\r':
                    builder.Append("\\r");
                    break;
                case '\t':
                    builder.Append("\\t");
                    break;
                default:
                    if (char.IsControl(ch))
                    {
                        builder.Append("\\u");
                        builder.Append(((int)ch).ToString("x4"));
                    }
                    else
                    {
                        builder.Append(ch);
                    }

                    break;
            }
        }

        return builder.ToString();
    }

    private void OnActivated(object sender, EventArgs e) =>
        RefreshRequested?.Invoke(this, EventArgs.Empty);
}

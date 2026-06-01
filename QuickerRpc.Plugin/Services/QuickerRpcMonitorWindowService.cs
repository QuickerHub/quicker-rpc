using System;
using System.Windows.Threading;
using QuickerRpc.Plugin.Rpc;
using QuickerRpc.Plugin.UI;

namespace QuickerRpc.Plugin.Services;

/// <summary>Shows and refreshes the QuickerRpc monitor window (agent page + recently edited actions).</summary>
public sealed class QuickerRpcMonitorWindowService
{
    private const int RefreshDebounceMs = 350;

    private readonly ActionMonitorSnapshotService _snapshots;
    private readonly ActionEditService _actionEdit;
    private QuickerRpcMonitorWindow? _window;
    private DispatcherTimer? _debounceTimer;

    public QuickerRpcMonitorWindowService(
        ActionMonitorSnapshotService snapshots,
        ActionEditService actionEdit)
    {
        _snapshots = snapshots;
        _actionEdit = actionEdit;
        ActionMonitorNotifier.CatalogChanged += OnCatalogChanged;
        QuickerRpcConnectionState.Changed += OnConnectionStateChanged;
    }

    public void Show() => QuickerDispatcherInvoke.OnUiThreadIfNeeded(ShowCore);

    public void Toggle() => QuickerDispatcherInvoke.OnUiThreadIfNeeded(ToggleCore);

    public void ScheduleRefresh() => QuickerDispatcherInvoke.OnUiThreadIfNeeded(ScheduleRefreshCore);

    private void ToggleCore()
    {
        if (_window is { IsVisible: true })
        {
            _window.Close();
            return;
        }

        ShowCore();
    }

    private void ShowCore()
    {
        if (_window is null)
        {
            _window = CreateWindow();
            _window.RefreshRequested += OnWindowRefreshRequested;
            _window.Show();
        }
        else if (!_window.IsVisible)
        {
            _window.Show();
        }
        else
        {
            _window.Activate();
        }

        RefreshNow();
    }

    private QuickerRpcMonitorWindow CreateWindow() =>
        new(_actionEdit, closed => _window = null);

    private void OnWindowRefreshRequested(object? sender, EventArgs e) => RefreshNow();

    private void OnCatalogChanged(object? sender, EventArgs e) => ScheduleRefresh();

    private void OnConnectionStateChanged(object? sender, EventArgs e)
    {
        if (_window is { IsVisible: true })
        {
            ScheduleRefresh();
        }
    }

    private void ScheduleRefreshCore()
    {
        if (_window is null || !_window.IsVisible)
        {
            return;
        }

        _debounceTimer ??= new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(RefreshDebounceMs) };
        _debounceTimer.Stop();
        _debounceTimer.Tick -= OnDebounceTick;
        _debounceTimer.Tick += OnDebounceTick;
        _debounceTimer.Start();
    }

    private void OnDebounceTick(object? sender, EventArgs e)
    {
        _debounceTimer?.Stop();
        RefreshNow();
    }

    private void RefreshNow()
    {
        if (_window is null)
        {
            return;
        }

        try
        {
            var snapshot = _snapshots.Load();
            var version = ProgramManager.CurrentVersion.ToString();
            _window.ApplySnapshot(snapshot, version, QuickerRpcConnectionState.IsClientConnected);
        }
        catch (Exception ex)
        {
            _window.SetFooterMessage($"刷新失败：{ex.Message}");
        }
    }
}

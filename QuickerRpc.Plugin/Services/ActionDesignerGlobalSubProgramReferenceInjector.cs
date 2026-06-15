using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Quicker.Domain.Actions.X;
using QuickerRpc.Plugin.Quicker;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Adds a hover "查找引用" button on each global subprogram list row and a split reference list below.
/// Reference scan runs on a background thread; results are applied on the UI dispatcher.
/// </summary>
internal static class ActionDesignerGlobalSubProgramReferenceInjector
{
    private const int DeferredInjectPassCount = 10;

    internal const string SplitGridTag = "QuickerRpc.GlobalSubProgramSplitGrid";
    internal const string ReferenceListTag = "QuickerRpc.GlobalSubProgramReferenceList";
    internal const string FindReferencesButtonTag = "QuickerRpc.FindSubProgramReferencesButton";

    private static int _classHandlersRegistered;
    private static readonly ConditionalWeakTable<ListBox, ListBoxHookState> HookedListBoxes = new();
    private static readonly ConditionalWeakTable<ListBox, ReferenceSearchSession> ActiveReferenceSearches = new();

    public static void RegisterClassHandlers()
    {
        if (Interlocked.CompareExchange(ref _classHandlersRegistered, 1, 0) != 0)
        {
            return;
        }

        var controlType = ActionDesignerGlobalSubProgramReflection.GlobalSubProgramListControlType;
        if (controlType is null)
        {
            Interlocked.Exchange(ref _classHandlersRegistered, 0);
            return;
        }

        EventManager.RegisterClassHandler(
            controlType,
            FrameworkElement.LoadedEvent,
            new RoutedEventHandler(OnGlobalSubProgramListControlLoaded));
    }

    public static bool TryInject(Window designer)
    {
        if (!ActionDesignerInjectionGate.CanInject()
            || !ActionDesignerReflection.IsDesignerWindow(designer))
        {
            return false;
        }

        RegisterClassHandlers();
        HookToolTabSelection(designer);

        if (ActionDesignerGlobalSubProgramReflection.TryGetSubProgramListBox(designer, out var listBox)
            && listBox is not null)
        {
            EnsureListBoxItemButtonHook(listBox);
            return true;
        }

        return false;
    }

    public static void ScheduleDeferredInject(Window designer)
    {
        if (!ActionDesignerInjectionGate.CanInject()
            || !ActionDesignerReflection.IsDesignerWindow(designer))
        {
            return;
        }

        var dispatcher = designer.Dispatcher ?? QuickerDispatcherInvoke.AppDispatcher;
        if (dispatcher is null)
        {
            return;
        }

        for (var pass = 0; pass < DeferredInjectPassCount; pass++)
        {
            _ = dispatcher.BeginInvoke(
                DispatcherPriority.Background,
                new Action(() =>
                {
                    RegisterClassHandlers();
                    TryInject(designer);
                }));
        }
    }

    public static void RemoveAll()
    {
        if (Application.Current?.Windows is null)
        {
            return;
        }

        foreach (Window window in Application.Current.Windows)
        {
            if (!ActionDesignerReflection.IsDesignerWindow(window))
            {
                continue;
            }

            if (ActionDesignerGlobalSubProgramReflection.TryGetSubProgramListBox(window, out var listBox)
                && listBox is not null)
            {
                if (listBox.Parent is Grid splitGrid
                    && string.Equals(splitGrid.Tag as string, SplitGridTag, StringComparison.Ordinal))
                {
                    var referenceList = splitGrid.Children
                        .OfType<ListBox>()
                        .FirstOrDefault(lb => string.Equals(lb.Tag as string, ReferenceListTag, StringComparison.Ordinal));
                    if (referenceList is not null)
                    {
                        CancelReferenceSearch(referenceList);
                    }
                }

                TryRemoveReferencePanel(listBox);
            }
        }
    }

    private static void OnGlobalSubProgramListControlLoaded(object sender, RoutedEventArgs e)
    {
        if (!ActionDesignerInjectionGate.CanInject()
            || !ReferenceEquals(sender, e.Source))
        {
            return;
        }

        RegisterClassHandlers();

        if (sender is not DependencyObject control)
        {
            return;
        }

        if (!ActionDesignerGlobalSubProgramReflection.TryGetSubProgramListBoxFromControl(control, out var listBox)
            || listBox is null)
        {
            return;
        }

        EnsureListBoxItemButtonHook(listBox);
    }

    private static void HookToolTabSelection(Window designer)
    {
        if (!ActionDesignerReflection.TryGetToolTab(designer, out var toolTab) || toolTab is null)
        {
            return;
        }

        if (toolTab.Tag as string == "QuickerRpc.GlobalSubProgramToolTabHook")
        {
            return;
        }

        toolTab.Tag = "QuickerRpc.GlobalSubProgramToolTabHook";
        toolTab.SelectionChanged += (_, _) =>
        {
            if (!ActionDesignerInjectionGate.CanInject())
            {
                return;
            }

            if (ActionDesignerGlobalSubProgramReflection.TryGetSubProgramListBox(designer, out var listBox)
                && listBox is not null)
            {
                EnsureListBoxItemButtonHook(listBox);
            }
        };
    }

    private static void EnsureListBoxItemButtonHook(ListBox listBox)
    {
        if (!ActionDesignerInjectionGate.CanInject())
        {
            return;
        }

        if (HookedListBoxes.TryGetValue(listBox, out _))
        {
            listBox.Dispatcher?.BeginInvoke(DispatcherPriority.Loaded, new Action(() => InjectAllItemButtons(listBox)));
            return;
        }

        var state = new ListBoxHookState(listBox);
        HookedListBoxes.Add(listBox, state);
        InjectAllItemButtons(listBox);
    }

    private static void InjectAllItemButtons(ListBox listBox)
    {
        if (!ActionDesignerInjectionGate.CanInject())
        {
            return;
        }

        var generator = listBox.ItemContainerGenerator;
        for (var i = 0; i < listBox.Items.Count; i++)
        {
            if (generator.ContainerFromIndex(i) is ListBoxItem item)
            {
                TryInjectItemButton(listBox, item);
            }
        }
    }

    private static void TryInjectItemButton(ListBox listBox, ListBoxItem item)
    {
        if (!ActionDesignerGlobalSubProgramReflection.TryGetSubProgramFromItem(item, out var subProgram)
            || subProgram is null)
        {
            return;
        }

        var hoverPanel = FindItemHoverPanel(item);
        if (hoverPanel is null)
        {
            return;
        }

        if (hoverPanel.Children.OfType<Button>().Any(IsFindReferencesButton))
        {
            return;
        }

        var button = CreateFindReferencesButton(listBox, subProgram);
        hoverPanel.Children.Add(button);
    }

    private static Panel? FindItemHoverPanel(ListBoxItem item)
    {
        var editButton = FindVisualChild<Button>(item, btn => btn.Name == "BtnEditSubProgram");
        if (editButton?.Parent is Panel panel)
        {
            return panel;
        }

        return FindVisualChild<StackPanel>(item, stack => stack.Children.OfType<Button>().Any());
    }

    private static Button CreateFindReferencesButton(ListBox listBox, SubProgram subProgram)
    {
        var button = new Button
        {
            Padding = new Thickness(2),
            Background = Brushes.Transparent,
            BorderThickness = new Thickness(0),
            ClickMode = ClickMode.Press,
            ToolTip = "查找引用",
            Tag = FindReferencesButtonTag,
            Margin = new Thickness(2, 0, 0, 0),
        };

        if (Application.Current?.TryFindResource("FlatButton") is Style flatButton)
        {
            button.Style = flatButton;
        }

        var icon = ActionDesignerFaIcon.TryCreate("fa:Light_Link:#8B5CF6", 14);
        button.Content = icon ?? new TextBlock
        {
            Text = "引用",
            FontSize = 10,
            VerticalAlignment = VerticalAlignment.Center,
        };

        button.Click += (_, _) =>
        {
            listBox.SelectedItem = subProgram;
            OnFindReferences(listBox, subProgram);
        };

        return button;
    }

    private static void OnFindReferences(ListBox subProgramList, SubProgram subProgram)
    {
        if (!EnsureReferencePanel(subProgramList, out var referenceList) || referenceList is null)
        {
            PopupMessage.Warning("无法创建引用列表区域。");
            return;
        }

        EnsureReferenceListHandlers(referenceList);

        var key = !string.IsNullOrWhiteSpace(subProgram.Id) ? subProgram.Id : subProgram.Name;
        if (string.IsNullOrWhiteSpace(key))
        {
            PopupMessage.Warning("无法识别所选公共子程序。");
            return;
        }

        var session = BeginReferenceSearch(referenceList);
        referenceList.IsEnabled = false;
        referenceList.ItemsSource = new List<ReferenceDisplayItem>
        {
            ReferenceDisplayItem.Loading(),
        };

        var dispatcher = subProgramList.Dispatcher ?? Application.Current?.Dispatcher;
        _ = ActionSubProgramCallScanner.FindAllReferencesAsync(subProgram, session.CancellationToken)
            .ContinueWith(
                task =>
                {
                    if (dispatcher is null)
                    {
                        return;
                    }

                    _ = dispatcher.BeginInvoke(
                        DispatcherPriority.Normal,
                        new Action(() => ApplyReferenceSearchResult(
                            referenceList,
                            session,
                            subProgram,
                            task)));
                },
                CancellationToken.None,
                TaskContinuationOptions.None,
                TaskScheduler.Default);
    }

    private static ReferenceSearchSession BeginReferenceSearch(ListBox referenceList)
    {
        if (ActiveReferenceSearches.TryGetValue(referenceList, out var existing))
        {
            existing.Cancel();
        }

        var session = new ReferenceSearchSession();
        ActiveReferenceSearches.Add(referenceList, session);
        return session;
    }

    private static void CancelReferenceSearch(ListBox referenceList)
    {
        if (ActiveReferenceSearches.TryGetValue(referenceList, out var session))
        {
            session.Cancel();
        }
    }

    private static void ApplyReferenceSearchResult(
        ListBox referenceList,
        ReferenceSearchSession session,
        SubProgram subProgram,
        Task<IReadOnlyList<SubProgramReferenceHit>> task)
    {
        if (!ActiveReferenceSearches.TryGetValue(referenceList, out var active) || !ReferenceEquals(active, session))
        {
            return;
        }

        referenceList.IsEnabled = true;

        if (task.IsCanceled || session.CancellationToken.IsCancellationRequested)
        {
            return;
        }

        if (task.IsFaulted)
        {
            referenceList.ItemsSource = Array.Empty<ReferenceDisplayItem>();
            PopupMessage.Warning(task.Exception?.GetBaseException().Message ?? "查找引用失败。");
            return;
        }

        var hits = task.Result;
        referenceList.ItemsSource = hits
            .Select(hit => new ReferenceDisplayItem { Hit = hit, Label = hit.DisplayLabel })
            .ToList();

        if (hits.Count == 0)
        {
            PopupMessage.Success($"未找到对「{subProgram.Name}」的引用。");
        }
    }

    private static void EnsureReferenceListHandlers(ListBox referenceList)
    {
        referenceList.DisplayMemberPath = nameof(ReferenceDisplayItem.Label);
        referenceList.MouseDoubleClick -= OnReferenceListMouseDoubleClick;
        referenceList.MouseDoubleClick += OnReferenceListMouseDoubleClick;
    }

    private static void OnReferenceListMouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (sender is ListBox referenceList)
        {
            OnReferenceDoubleClick(referenceList);
        }
    }

    private static void OnReferenceDoubleClick(ListBox referenceList)
    {
        if (referenceList.SelectedItem is not ReferenceDisplayItem { IsLoading: false, Hit: { } hit })
        {
            return;
        }

        string? error;
        if (hit.Kind == SubProgramReferenceTargetKind.Action)
        {
            if (ActionDesignerGlobalSubProgramReflection.TryOpenActionEditor(hit.Id, out error))
            {
                return;
            }

            PopupMessage.Warning(error ?? "打开动作失败。");
            return;
        }

        var accessor = DataServiceSubProgramAccessor.TryCreate();
        if (accessor is null)
        {
            PopupMessage.Warning("打开公共子程序失败。");
            return;
        }

        if (!accessor.TryGetByIdOrName(hit.Id, out var subProgram, out error)
            || subProgram is null)
        {
            PopupMessage.Warning(error ?? "打开公共子程序失败。");
            return;
        }

        if (ActionDesignerGlobalSubProgramReflection.TryOpenGlobalSubProgramEditor(subProgram, out error))
        {
            return;
        }

        PopupMessage.Warning(error ?? "打开公共子程序失败。");
    }

    private static bool EnsureReferencePanel(ListBox listBox, out ListBox? referenceListBox)
    {
        referenceListBox = null;
        if (listBox.Parent is Grid existingSplit
            && string.Equals(existingSplit.Tag as string, SplitGridTag, StringComparison.Ordinal))
        {
            referenceListBox = existingSplit.Children
                .OfType<ListBox>()
                .FirstOrDefault(lb => string.Equals(lb.Tag as string, ReferenceListTag, StringComparison.Ordinal));
            return referenceListBox is not null;
        }

        if (listBox.Parent is not Panel parentPanel)
        {
            return false;
        }

        var index = parentPanel.Children.IndexOf(listBox);
        if (index < 0)
        {
            return false;
        }

        var row = Grid.GetRow(listBox);
        var column = Grid.GetColumn(listBox);
        var rowSpan = Grid.GetRowSpan(listBox);
        var columnSpan = Grid.GetColumnSpan(listBox);
        var dock = parentPanel is DockPanel ? DockPanel.GetDock(listBox) : (Dock?)null;

        parentPanel.Children.RemoveAt(index);

        var splitGrid = new Grid
        {
            Tag = SplitGridTag,
        };
        splitGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        splitGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

        splitGrid.Children.Add(listBox);
        Grid.SetRow(listBox, 0);
        Grid.SetColumn(listBox, 0);

        referenceListBox = new ListBox
        {
            Tag = ReferenceListTag,
            Margin = new Thickness(0, 2, 0, 0),
        };
        splitGrid.Children.Add(referenceListBox);
        Grid.SetRow(referenceListBox, 1);
        Grid.SetColumn(referenceListBox, 0);

        parentPanel.Children.Insert(index, splitGrid);
        if (parentPanel is Grid parentGrid)
        {
            Grid.SetRow(splitGrid, row);
            Grid.SetColumn(splitGrid, column);
            Grid.SetRowSpan(splitGrid, rowSpan);
            Grid.SetColumnSpan(splitGrid, columnSpan);
        }
        else if (dock is not null)
        {
            DockPanel.SetDock(splitGrid, dock.Value);
        }

        return true;
    }

    private static void TryRemoveReferencePanel(ListBox listBox)
    {
        if (listBox.Parent is not Grid splitGrid
            || !string.Equals(splitGrid.Tag as string, SplitGridTag, StringComparison.Ordinal))
        {
            return;
        }

        if (splitGrid.Parent is not Panel parentPanel)
        {
            return;
        }

        var index = parentPanel.Children.IndexOf(splitGrid);
        if (index < 0)
        {
            return;
        }

        var row = Grid.GetRow(splitGrid);
        var column = Grid.GetColumn(splitGrid);
        var rowSpan = Grid.GetRowSpan(splitGrid);
        var columnSpan = Grid.GetColumnSpan(splitGrid);
        var dock = parentPanel is DockPanel ? DockPanel.GetDock(splitGrid) : (Dock?)null;

        splitGrid.Children.Remove(listBox);
        parentPanel.Children.RemoveAt(index);
        parentPanel.Children.Insert(index, listBox);

        if (parentPanel is Grid parentGrid)
        {
            Grid.SetRow(listBox, row);
            Grid.SetColumn(listBox, column);
            Grid.SetRowSpan(listBox, rowSpan);
            Grid.SetColumnSpan(listBox, columnSpan);
        }
        else if (dock is not null)
        {
            DockPanel.SetDock(listBox, dock.Value);
        }
    }

    private static bool IsFindReferencesButton(Button button) =>
        string.Equals(button.Tag as string, FindReferencesButtonTag, StringComparison.Ordinal);

    private static T? FindVisualChild<T>(DependencyObject root, Func<T, bool>? predicate = null)
        where T : DependencyObject
    {
        var count = VisualTreeHelper.GetChildrenCount(root);
        for (var i = 0; i < count; i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is T typed && (predicate is null || predicate(typed)))
            {
                return typed;
            }

            var found = FindVisualChild(child, predicate);
            if (found is not null)
            {
                return found;
            }
        }

        return null;
    }

    private sealed class ListBoxHookState
    {
        public ListBoxHookState(ListBox listBox)
        {
            listBox.ItemContainerGenerator.StatusChanged += (_, _) =>
            {
                if (listBox.ItemContainerGenerator.Status == GeneratorStatus.ContainersGenerated)
                {
                    InjectAllItemButtons(listBox);
                }
            };
        }
    }

    private sealed class ReferenceSearchSession
    {
        private readonly CancellationTokenSource _cts = new();

        public CancellationToken CancellationToken => _cts.Token;

        public void Cancel()
        {
            if (!_cts.IsCancellationRequested)
            {
                _cts.Cancel();
            }
        }
    }

    private sealed class ReferenceDisplayItem
    {
        public SubProgramReferenceHit? Hit { get; init; }

        public required string Label { get; init; }

        public bool IsLoading { get; init; }

        public static ReferenceDisplayItem Loading() => new()
        {
            Label = "正在查找引用…",
            IsLoading = true,
        };
    }
}

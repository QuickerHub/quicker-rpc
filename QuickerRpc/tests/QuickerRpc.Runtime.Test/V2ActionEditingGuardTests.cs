using System.Reflection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Runtime.Test;

[TestClass]
public sealed class V2ActionEditingGuardTests
{
    [TestMethod]
    public void Missing_editing_service_or_method_refuses_save_before_persist_or_sync()
    {
        foreach (var missingService in new[] { true, false })
        {
            var state = new FakeEditingState();
            var fixture = Create(missingService ? null : state, missingService ? Method(nameof(FakeEditingState.IsActionEditing)) : null);
            AssertRefused(fixture, "DESIGNER_STATE_UNAVAILABLE");
            Assert.AreEqual(0, state.Calls);
        }
    }

    [TestMethod]
    public void Reflection_failure_or_non_boolean_state_refuses_save_before_persist_or_sync()
    {
        var throwing = new FakeEditingState { ThrowOnRead = true };
        var fixture = Create(throwing, Method(nameof(FakeEditingState.IsActionEditing)));
        var error = AssertRefused(fixture, "DESIGNER_STATE_UNAVAILABLE");
        StringAssert.Contains(error, "fixture editing state failed");
        Assert.AreEqual(1, throwing.Calls);

        fixture = Create(new FakeEditingState(), Method(nameof(FakeEditingState.UnsupportedEditingState)));
        AssertRefused(fixture, "DESIGNER_STATE_UNAVAILABLE");
    }

    [TestMethod]
    public void Confirmed_open_editor_refuses_save_before_persist_or_sync()
    {
        var state = new FakeEditingState { Editing = true };
        var fixture = Create(state, Method(nameof(FakeEditingState.IsActionEditing)));
        AssertRefused(fixture, "DESIGNER_OPEN");
        Assert.AreEqual("fixture-action", state.LastActionId);
        Assert.AreEqual(1, state.Calls);
    }

    [TestMethod]
    public void Confirmed_closed_editor_persists_once_and_only_then_triggers_owned_fake_sync()
    {
        var state = new FakeEditingState();
        var fixture = Create(state, Method(nameof(FakeEditingState.IsActionEditing)));
        var action = new FakeAction();
        Assert.IsTrue(fixture.Accessor.TrySaveAction(action, out var error, out var code));
        Assert.IsNull(error);
        Assert.IsNull(code);
        Assert.AreEqual(1, state.Calls);
        Assert.AreEqual(1, fixture.Store.Saves);
        Assert.AreSame(action, fixture.Store.LastSaved);
        CollectionAssert.AreEqual(new[] { "persist", "sync" }, fixture.Events);
    }

    [TestMethod]
    public void Missing_action_identity_refuses_save_without_querying_editing_state()
    {
        var state = new FakeEditingState();
        var fixture = Create(state, Method(nameof(FakeEditingState.IsActionEditing)));
        Assert.IsFalse(fixture.Accessor.TrySaveAction(new FakeAction { Id = " " }, out _, out var code));
        Assert.AreEqual("MISSING_ACTION_ID", code);
        Assert.AreEqual(0, state.Calls);
        Assert.AreEqual(0, fixture.Store.Saves);
        Assert.AreEqual(0, fixture.Events.Count);
    }

    [TestMethod]
    public async Task Guard_error_codes_survive_body_and_presentation_rpc_results_even_with_force()
    {
        foreach (var editingKnown in new[] { false, true })
        {
            var state = new FakeEditingState { Editing = true };
            var fixture = Create(editingKnown ? state : null, Method(nameof(FakeEditingState.IsActionEditing)));
            var port = DispatchProxy.Create<IQuickerRpcActionProgramHost, GuardedProgramPort>();
            ((GuardedProgramPort)(object)port).Accessor = fixture.Accessor;
            var host = DispatchProxy.Create<IQuickerRpcHost, FakeHost>();
            ((FakeHost)(object)host).Programs = port;
            var dependencies = new QuickerRpcRuntimeDependencies(() => throw new AssertFailedException("Guard failure must not build a catalog."), "fake");
            var service = new QuickerRpcService(host, new InlineScheduler(), new NoFeedback(), new ActionProgramRpcHandler(dependencies), new SubProgramRpcHandler(dependencies));
            var expected = editingKnown ? "DESIGNER_OPEN" : "DESIGNER_STATE_UNAVAILABLE";
            var body = await service.ApplyXActionToActionAsync("fixture-action", "{}", force: true);
            Assert.IsFalse(body.Success);
            Assert.AreEqual(expected, body.ErrorCode);
            var metadata = await service.UpdateActionMetadataAsync("fixture-action", title: "fixture", force: true);
            Assert.IsFalse(metadata.Success);
            Assert.AreEqual(expected, metadata.ErrorCode);
            Assert.AreEqual(0, fixture.Store.Saves);
            Assert.AreEqual(0, fixture.Events.Count);
        }
    }

    private static string AssertRefused(Fixture fixture, string expectedCode)
    {
        Assert.IsFalse(fixture.Accessor.TrySaveAction(new FakeAction(), out var error, out var code));
        Assert.AreEqual(expectedCode, code);
        Assert.IsFalse(string.IsNullOrWhiteSpace(error));
        Assert.AreEqual(0, fixture.Store.Saves);
        Assert.AreEqual(0, fixture.Events.Count);
        return error!;
    }

    private static MethodInfo Method(string name) => typeof(FakeEditingState).GetMethod(name)!;

    private static Fixture Create(object? state, MethodInfo? query)
    {
        var events = new List<string>();
        var store = new FakeStore(events);
        var lookup = new FakeLookup();
        var accessor = new QuickerV2ActionAccessor(
            lookup,
            typeof(FakeLookup).GetMethod(nameof(FakeLookup.GetActionWithLocationByIdOrNameOrSourceId))!,
            null,
            store,
            typeof(FakeStore).GetMethod(nameof(FakeStore.AddOrUpdateAction))!,
            state,
            query,
            typeof(FakeExtensions),
            typeof(FakeAction),
            afterPersist: () => events.Add("sync"));
        return new(accessor, store, events);
    }

    private sealed record Fixture(QuickerV2ActionAccessor Accessor, FakeStore Store, List<string> Events);
    public sealed class FakeAction { public string Id { get; set; } = "fixture-action"; }
    public sealed class FakeEditingState
    {
        public bool Editing { get; set; }
        public bool ThrowOnRead { get; set; }
        public int Calls { get; private set; }
        public string? LastActionId { get; private set; }
        public bool IsActionEditing(string actionId)
        {
            Calls++;
            LastActionId = actionId;
            if (ThrowOnRead) throw new InvalidOperationException("fixture editing state failed");
            return Editing;
        }
        public string UnsupportedEditingState(string actionId) => "unknown";
    }
    public sealed class FakeStore(List<string> events)
    {
        public int Saves { get; private set; }
        public FakeAction? LastSaved { get; private set; }
        public void AddOrUpdateAction(FakeAction action)
        {
            Saves++;
            LastSaved = action;
            events.Add("persist");
        }
    }
    public sealed class FakeLookup
    {
        public (object?, object?) GetActionWithLocationByIdOrNameOrSourceId(string id, bool includeHidden) =>
            throw new AssertFailedException("Save guard must not look up the host catalog.");
    }
    public static class FakeExtensions { }
    public class GuardedProgramPort : DispatchProxy
    {
        internal QuickerV2ActionAccessor Accessor { get; set; } = null!;
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            Assert.IsTrue(targetMethod!.Name is nameof(IQuickerRpcActionProgramHost.TryWriteProgramBodyAsync)
                or nameof(IQuickerRpcActionProgramHost.TryUpdatePresentationAsync));
            Assert.IsFalse(Accessor.TrySaveAction(new FakeAction(), out var error, out var code));
            return Task.FromResult(QuickerRpcActionProgramWriteResult.Fail("fixture-action", error!, code));
        }
    }
    public class FakeHost : DispatchProxy
    {
        public IQuickerRpcActionProgramHost Programs { get; set; } = null!;
        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) => targetMethod!.Name switch
        {
            "get_ActionPrograms" => Programs,
            _ => throw new AssertFailedException("Unexpected host port access: " + targetMethod.Name),
        };
    }
    private sealed class InlineScheduler : IQuickerRpcCallScheduler
    {
        public Task<T> InvokeOnUiThreadAsync<T>(Func<Task<T>> action, CancellationToken cancellationToken = default) => action();
        public Task<T> InvokeOffUiThreadAsync<T>(Func<T> action, CancellationToken cancellationToken = default) => Task.FromResult(action());
        public T? InvokeOnUiThreadIfNeeded<T>(Func<T?> action) => action();
    }
    private sealed class NoFeedback : IQuickerRpcUserFeedback
    {
        public void Success(string message) => throw new AssertFailedException();
        public void Error(string message) => throw new AssertFailedException();
    }
}

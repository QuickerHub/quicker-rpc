using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Debugging;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// End-to-end offline pipeline: synthetic trace → AttachFailureLocation → CLI JSON contract.
/// No Quicker process required.
/// </summary>
[TestClass]
public sealed class ActionTracePipelineTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void Pipeline_workspace_fail_fixture_resolves_failure_location()
    {
        var steps = LoadWorkspaceFixtureSteps("trace-fail-evalexpression");
        var events = ActionTraceSyntheticEventFactory.BuildLinearFailureTrace(
            steps,
            failingStepId: "s-fail",
            errorMessage: "Input string was not in a correct format.");

        var result = new QuickerRpcActionTraceRunResult
        {
            Ok = false,
            ActionId = "00000000-0000-4000-8000-000000000002",
            ErrorMessage = "Input string was not in a correct format.",
            Message = "Input string was not in a correct format.",
            Events = events,
            EventCount = events.Count,
        };

        ActionTraceLocationResolver.AttachFailureLocation(result, steps);

        Assert.IsNotNull(result.FailureLocation);
        Assert.AreEqual("1", result.FailureLocation!.StepPath);
        Assert.AreEqual("s-fail", result.FailureLocation.StepId);
        Assert.AreEqual("sys:evalexpression", result.FailureLocation.StepRunnerKey);
        Assert.AreEqual("expression", result.FailureLocation.ParamKey);
        Assert.AreEqual("steps[1].inputParams.expression", result.FailureLocation.DataJsonPointer);
        Assert.AreEqual("stepId", result.FailureLocation.MatchMethod);
    }

    [TestMethod]
    public void Pipeline_cli_json_includes_failure_location_shape()
    {
        var steps = LoadWorkspaceFixtureSteps("trace-fail-evalexpression");
        var events = ActionTraceSyntheticEventFactory.BuildLinearFailureTrace(
            steps,
            failingStepId: "s-fail",
            errorMessage: "Input string was not in a correct format.");

        var result = ActionTraceLocationResolver.AttachFailureLocation(
            new QuickerRpcActionTraceRunResult
            {
                Ok = false,
                Events = events,
                EventCount = events.Count,
                ErrorMessage = "Input string was not in a correct format.",
                Message = "Input string was not in a correct format.",
            },
            steps);

        var cliPayload = new
        {
            ok = result.Ok,
            action = "trace",
            trace = true,
            eventCount = result.EventCount,
            errorMessage = result.ErrorMessage,
            message = result.Message,
            events = result.Events,
            failureLocation = result.FailureLocation,
        };

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
        var json = JsonSerializer.Serialize(cliPayload, jsonOptions);
        var root = JObject.Parse(json);

        TestContext.WriteLine(json);

        Assert.AreEqual(false, root.Value<bool>("ok"));
        var failure = root["failureLocation"] as JObject;
        Assert.IsNotNull(failure);
        Assert.AreEqual("1", failure!.Value<string>("stepPath"));
        Assert.AreEqual("s-fail", failure.Value<string>("stepId"));
        Assert.AreEqual("steps[1].inputParams.expression", failure.Value<string>("dataJsonPointer"));
        Assert.IsTrue(root["events"] is JArray { Count: > 0 });
    }

    [TestMethod]
    public void Pipeline_fixture_scenarios_match_resolver_expectations()
    {
        var root = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "Fixtures",
            "trace-failure-location");
        Assert.IsTrue(Directory.Exists(root));

        foreach (var scenarioDir in Directory.EnumerateDirectories(root).OrderBy(p => p, StringComparer.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(scenarioDir);
            var program = JObject.Parse(File.ReadAllText(Path.Combine(scenarioDir, "program.json")));
            var steps = program["steps"] as JArray
                ?? throw new InvalidOperationException($"{name}: missing steps");
            var eventsJson = JArray.Parse(File.ReadAllText(Path.Combine(scenarioDir, "events.json")));
            var expected = JObject.Parse(File.ReadAllText(Path.Combine(scenarioDir, "expected.json")));

            var events = eventsJson
                .OfType<JObject>()
                .Select(ParseTraceEvent)
                .ToList();

            var result = ActionTraceLocationResolver.AttachFailureLocation(
                new QuickerRpcActionTraceRunResult
                {
                    Ok = false,
                    Events = events,
                    EventCount = events.Count,
                    ErrorMessage = "fixture failure",
                },
                steps);

            TestContext.WriteLine($"pipeline scenario: {name} → {result.FailureLocation?.StepPath}");
            Assert.IsNotNull(result.FailureLocation, $"{name}: missing failureLocation");
            AssertField(name, expected, "stepPath", result.FailureLocation!.StepPath);
            AssertField(name, expected, "dataJsonPointer", result.FailureLocation.DataJsonPointer);
            AssertField(name, expected, "matchMethod", result.FailureLocation.MatchMethod);
        }
    }

    [TestMethod]
    public void Pipeline_offline_runner_failure_aligns_with_synthetic_trace()
    {
        var project = LoadWorkspaceFixture("trace-fail-evalexpression");
        var steps = project.CompiledData["steps"] as JArray;
        Assert.IsNotNull(steps);

        var offline = new WorkspaceActionOfflineRunner().Run(
            project,
            new WorkspaceActionOfflineRunner.Options());
        if (!offline.Success && offline.ErrorMessage?.IndexOf("Quicker", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Assert.Inconclusive(offline.ErrorMessage + " (install Quicker for cross-check)");
        }

        Assert.IsFalse(offline.Success, "fixture should fail offline");
        var failed = offline.Steps.LastOrDefault(s => !s.Success);
        Assert.IsNotNull(failed);
        Assert.AreEqual("s-fail", failed!.StepId);

        var events = ActionTraceSyntheticEventFactory.BuildLinearFailureTrace(
            steps,
            failingStepId: failed.StepId,
            errorMessage: failed.ErrorMessage ?? offline.ErrorMessage ?? "failed");

        var result = ActionTraceLocationResolver.AttachFailureLocation(
            new QuickerRpcActionTraceRunResult
            {
                Ok = false,
                Events = events,
                EventCount = events.Count,
                ErrorMessage = failed.ErrorMessage,
            },
            steps);

        Assert.AreEqual("1", result.FailureLocation?.StepPath);
    }

    private static JArray LoadWorkspaceFixtureSteps(string fixtureName) =>
        LoadWorkspaceFixture(fixtureName).CompiledData["steps"] as JArray
        ?? throw new InvalidOperationException($"{fixtureName}: compiled steps missing");

    private static QuickerRpc.AgentModel.XAction.Testing.WorkspaceActionTestEnvironment.LoadedProject LoadWorkspaceFixture(
        string fixtureName)
    {
        var dir = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "Fixtures",
            "workspace-actions",
            fixtureName);
        var load = QuickerRpc.AgentModel.XAction.Testing.WorkspaceActionTestEnvironment.TryLoadFromDirectory(dir);
        Assert.IsTrue(load.Success, load.ErrorMessage);
        return load.Project!;
    }

    private static void AssertField(string name, JObject expected, string field, string? actual)
    {
        if (!expected.ContainsKey(field))
        {
            return;
        }

        Assert.AreEqual(expected.Value<string>(field), actual, $"{name}: {field}");
    }

    private static QuickerRpcActionTraceEvent ParseTraceEvent(JObject row) =>
        new()
        {
            Kind = row.Value<string>("kind") ?? string.Empty,
            StepId = row.Value<string>("stepId"),
            StepRunnerKey = row.Value<string>("stepRunnerKey"),
            StepPath = row.Value<string>("stepPath"),
            Note = row.Value<string>("note"),
            Message = row.Value<string>("message"),
            ParamKey = row.Value<string>("paramKey"),
        };
}

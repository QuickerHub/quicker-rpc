using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Debugging;

namespace QuickerRpc.Plugin.Test;

/// <summary>
/// Data-driven offline verification: program.json + events.json → expected failureLocation fields.
/// </summary>
[TestClass]
public sealed class ActionTraceLocationFixtureTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void Fixture_scenarios_resolve_failure_location()
    {
        var root = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "Fixtures",
            "trace-failure-location");
        Assert.IsTrue(Directory.Exists(root), $"Missing fixture root: {root}");

        var scenarios = Directory
            .EnumerateDirectories(root)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();
        Assert.IsTrue(scenarios.Count > 0, "Add scenarios under Fixtures/trace-failure-location/");

        foreach (var scenarioDir in scenarios)
        {
            var name = Path.GetFileName(scenarioDir);
            TestContext.WriteLine($"scenario: {name}");
            RunScenario(scenarioDir, name);
        }
    }

    private static void RunScenario(string scenarioDir, string name)
    {
        var programPath = Path.Combine(scenarioDir, "program.json");
        var eventsPath = Path.Combine(scenarioDir, "events.json");
        var expectedPath = Path.Combine(scenarioDir, "expected.json");

        Assert.IsTrue(File.Exists(programPath), $"{name}: missing program.json");
        Assert.IsTrue(File.Exists(eventsPath), $"{name}: missing events.json");
        Assert.IsTrue(File.Exists(expectedPath), $"{name}: missing expected.json");

        var program = JObject.Parse(File.ReadAllText(programPath));
        var steps = program["steps"] as JArray
            ?? throw new InvalidOperationException($"{name}: program.json must contain steps[]");

        var eventsJson = JArray.Parse(File.ReadAllText(eventsPath));
        var events = eventsJson
            .OfType<JObject>()
            .Select(ParseTraceEvent)
            .ToList();

        var expected = JObject.Parse(File.ReadAllText(expectedPath));
        var fallback = expected.Value<string>("fallbackErrorMessage");

        var location = ActionTraceLocationResolver.ResolveFailureLocation(
            events,
            steps,
            fallbackErrorMessage: fallback);

        Assert.IsNotNull(location, $"{name}: expected a failure location");
        AssertExpected(name, expected, location!);
    }

    private static void AssertExpected(
        string name,
        JObject expected,
        QuickerRpcActionTraceFailureLocation location)
    {
        AssertField(name, expected, "stepPath", location.StepPath);
        AssertField(name, expected, "stepId", location.StepId);
        AssertField(name, expected, "stepRunnerKey", location.StepRunnerKey);
        AssertField(name, expected, "paramKey", location.ParamKey);
        AssertField(name, expected, "dataJsonPointer", location.DataJsonPointer);
        AssertField(name, expected, "matchMethod", location.MatchMethod);
    }

    private static void AssertField(
        string name,
        JObject expected,
        string field,
        string? actual)
    {
        if (!expected.ContainsKey(field))
        {
            return;
        }

        var want = expected.Value<string>(field);
        Assert.AreEqual(want, actual, $"{name}: {field}");
    }

    private static QuickerRpcActionTraceEvent ParseTraceEvent(JObject row)
    {
        return new QuickerRpcActionTraceEvent
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
}

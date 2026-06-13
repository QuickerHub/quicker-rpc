using Quicker.ActionRuntime.Abstractions;
using Quicker.ActionRuntime.Mocking;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal static class MockAssertionEvaluator
{
    internal static MockAssertionResult Evaluate(
        MockProfileDocument profile,
        RuntimeExecutionResult result,
        DeterministicTestScope scope,
        bool runAssertions)
    {
        if (!runAssertions || profile.Assertions == null)
        {
            return new MockAssertionResult { Ran = runAssertions, Passed = result.IsSuccess };
        }

        var failures = new List<MockAssertionFailure>();
        var hints = new List<MockFixHint>();
        var assertions = profile.Assertions;

        if (assertions.Success is { } expectedSuccess && expectedSuccess != result.IsSuccess)
        {
            failures.Add(new MockAssertionFailure
            {
                Code = "SUCCESS_MISMATCH",
                Message = $"expected success={expectedSuccess}, got {result.IsSuccess}"
                    + (string.IsNullOrWhiteSpace(result.ErrorMessage) ? string.Empty : $": {result.ErrorMessage}"),
            });
        }

        if (assertions.OutputVars != null)
        {
            foreach (var (key, expected) in assertions.OutputVars)
            {
                var actual = NormalizeOutputVar(result.OutputVars, key);
                if (!OutputVarMatches(expected, actual))
                {
                    failures.Add(new MockAssertionFailure
                    {
                        Code = "OUTPUT_VAR_MISMATCH",
                        Message = $"expected outputVars.{key}={expected}, got {actual ?? "null"}",
                    });

                    if (key.Equals("c", StringComparison.OrdinalIgnoreCase)
                        && profile.Id?.Contains("multi-var", StringComparison.OrdinalIgnoreCase) == true)
                    {
                        hints.Add(new MockFixHint
                        {
                            Code = "OUTPUT_VAR_MISMATCH",
                            Message = failures[^1].Message,
                            Hint = "evalexpression number vars: use Convert.ToDouble(1) for numeric literals",
                            DocRef = "quicker-authoring-evalexpression-multi-var",
                        });
                    }
                }
            }
        }

        if (!string.IsNullOrEmpty(assertions.ClipboardText))
        {
            var clipText = scope.Clipboard.UnicodeText;
            if (!string.Equals(assertions.ClipboardText, clipText, StringComparison.Ordinal))
            {
                failures.Add(new MockAssertionFailure
                {
                    Code = "CLIPBOARD_MISMATCH",
                    Message = $"expected clipboardText={assertions.ClipboardText}, got {clipText ?? "null"}",
                });
            }
        }

        if (assertions.ClipboardTextContains != null)
        {
            var clipText = scope.Clipboard.UnicodeText ?? string.Empty;
            foreach (var needle in assertions.ClipboardTextContains)
            {
                if (!clipText.Contains(needle, StringComparison.Ordinal))
                {
                    failures.Add(new MockAssertionFailure
                    {
                        Code = "CLIPBOARD_MISSING",
                        Message = $"expected clipboard to contain '{needle}'",
                    });
                }
            }
        }

        if (assertions.TextOutputContains != null)
        {
            var haystack = CollectHostText(scope.HostServices);
            foreach (var needle in assertions.TextOutputContains)
            {
                if (!haystack.Contains(needle, StringComparison.OrdinalIgnoreCase))
                {
                    failures.Add(new MockAssertionFailure
                    {
                        Code = "TEXT_OUTPUT_MISSING",
                        Message = $"expected text output to contain '{needle}'",
                    });
                }
            }
        }

        if (assertions.NotificationsContain != null)
        {
            var notifications = scope.HostServices.Notifications
                .Select(static n => n.Message ?? string.Empty)
                .ToList();
            foreach (var needle in assertions.NotificationsContain)
            {
                if (!notifications.Any(n => n.Contains(needle, StringComparison.OrdinalIgnoreCase)))
                {
                    failures.Add(new MockAssertionFailure
                    {
                        Code = "NOTIFICATION_MISSING",
                        Message = $"expected notification to contain '{needle}'",
                    });
                }
            }
        }

        return new MockAssertionResult
        {
            Ran = true,
            Passed = failures.Count == 0,
            Failures = failures,
            FixHints = hints,
        };
    }

    internal static MockLedger BuildLedger(DeterministicTestScope scope) =>
        new()
        {
            Clipboard = new MockLedgerClipboard
            {
                FinalUnicodeText = scope.Clipboard.UnicodeText,
            },
            Http = scope.HttpBackend.Responses
                .Select(static pair => new MockLedgerHttp
                {
                    Url = pair.Key,
                    StatusCode = pair.Value.StatusCode,
                })
                .ToList(),
            Host = new MockLedgerHost
            {
                Notifications = scope.HostServices.Notifications
                    .Select(static n => n.Message ?? string.Empty)
                    .ToList(),
                TextOutputs = scope.HostServices.TextOutputs
                    .Select(static t => t.Content ?? string.Empty)
                    .ToList(),
                FormsSubmitted = 0,
            },
            Files = scope.FileOperations
                .Select(static op => new MockLedgerFile
                {
                    Operation = op.Operation,
                    Path = op.Path,
                })
                .ToList(),
        };

    private static bool OutputVarMatches(string expected, string? actual)
    {
        if (string.Equals(expected, actual, StringComparison.Ordinal))
        {
            return true;
        }

        if (bool.TryParse(expected, out var expectedBool)
            && bool.TryParse(actual, out var actualBool))
        {
            return expectedBool == actualBool;
        }

        return false;
    }

    private static string? NormalizeOutputVar(IReadOnlyDictionary<string, object>? vars, string key)
    {
        if (vars == null || !vars.TryGetValue(key, out var value))
        {
            return null;
        }

        return value?.ToString();
    }

    private static string CollectHostText(RecordingHostServices host)
    {
        var parts = new List<string>();
        parts.AddRange(host.Informations);
        parts.AddRange(host.TextOutputs.Select(static t => t.Content ?? string.Empty));
        parts.AddRange(host.ShowTextWindows.Select(static t => t.Content ?? string.Empty));
        parts.AddRange(host.Notifications.Select(static n => n.Message ?? string.Empty));
        return string.Join('\n', parts);
    }
}

using System.Text.Json;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal sealed class MockProfileDocument
{
    public string? Id { get; set; }

    public int Version { get; set; } = 1;

    public string? InputParam { get; set; }

    public Dictionary<string, JsonElement>? InitialVars { get; set; }

    public MockProfileMocks? Mocks { get; set; }

    public MockProfileAssertions? Assertions { get; set; }
}

internal sealed class MockProfileMocks
{
    public MockProfileClipboard? Clipboard { get; set; }

    public Dictionary<string, MockProfileHttpResponse>? Http { get; set; }

    public MockProfileTime? Time { get; set; }

    public MockProfileHost? Host { get; set; }

    public MockProfileWindow? Window { get; set; }

    public MockProfileFiles? Files { get; set; }

    public MockProfileSubPrograms? SubPrograms { get; set; }
}

internal sealed class MockProfileWindow
{
    public string? ForegroundTitle { get; set; }

    public long? ForegroundHandle { get; set; }
}

internal sealed class MockProfileClipboard
{
    public string? UnicodeText { get; set; }
}

internal sealed class MockProfileHttpResponse
{
    public int StatusCode { get; set; } = 200;

    public string? Content { get; set; }
}

internal sealed class MockProfileTime
{
    public string? FixedUtc { get; set; }
}

internal sealed class MockProfileHost
{
    public string? MessageBox { get; set; }

    public string? UserInput { get; set; }

    public Dictionary<string, JsonElement>? FormVariables { get; set; }

    public string? ExplorerPath { get; set; }

    public string? SelectedFile { get; set; }
}

internal sealed class MockProfileFiles
{
    public List<MockProfileFileSeed>? Seed { get; set; }
}

internal sealed class MockProfileFileSeed
{
    public string? Path { get; set; }

    public string? Content { get; set; }
}

internal sealed class MockProfileSubPrograms
{
    public bool? StubExternal { get; set; }

    public bool? StubAll { get; set; }

    public string? StubResultText { get; set; }
}

internal sealed class MockProfileAssertions
{
    public bool? Success { get; set; }

    public Dictionary<string, string>? OutputVars { get; set; }

    public string? ClipboardText { get; set; }

    public List<string>? ClipboardTextContains { get; set; }

    public List<string>? TextOutputContains { get; set; }

    public List<string>? NotificationsContain { get; set; }
}

internal sealed class MockAssertionResult
{
    public bool Ran { get; init; }

    public bool Passed { get; init; }

    public List<MockAssertionFailure> Failures { get; init; } = [];

    public List<MockFixHint> FixHints { get; init; } = [];
}

internal sealed class MockAssertionFailure
{
    public string Code { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;
}

internal sealed class MockFixHint
{
    public string Code { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;

    public string? Hint { get; init; }

    public string? DocRef { get; init; }
}

internal sealed class MockLedger
{
    public MockLedgerClipboard? Clipboard { get; init; }

    public List<MockLedgerHttp> Http { get; init; } = [];

    public MockLedgerHost? Host { get; init; }

    public List<MockLedgerFile> Files { get; init; } = [];
}

internal sealed class MockLedgerClipboard
{
    public string? FinalUnicodeText { get; init; }
}

internal sealed class MockLedgerHttp
{
    public string Url { get; init; } = string.Empty;

    public int StatusCode { get; init; }
}

internal sealed class MockLedgerHost
{
    public List<string> Notifications { get; init; } = [];

    public List<string> TextOutputs { get; init; } = [];

    public int FormsSubmitted { get; init; }
}

internal sealed class MockLedgerFile
{
    public string Operation { get; init; } = string.Empty;

    public string Path { get; init; } = string.Empty;
}

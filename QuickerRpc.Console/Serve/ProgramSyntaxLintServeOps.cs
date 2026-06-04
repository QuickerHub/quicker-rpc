using System.Collections.Concurrent;
using System.Text.Json;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Lint;
using QuickerRpc.AgentModel.XAction.Project;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

/// <summary>Async program syntax lint via qkrpc serve (collect on disk, check via plugin RPC).</summary>
internal static class ProgramSyntaxLintServeOps
{
    private const int MaxIssuesReturned = 40;
    private const int MaxChecksPerRun = 80;

    private static readonly ConcurrentDictionary<string, CancellationTokenSource> InFlight =
        new(StringComparer.OrdinalIgnoreCase);

    internal static ServeInvokeResponse Schedule(JsonElement args)
    {
        var projectDir = ResolveProjectDirectory(args, out var error);
        if (error is not null)
        {
            return Fail(error.Value.code, error.Value.message);
        }

        var workspaceRoot = ResolveWorkspaceRoot(args);
        var target = ServeJsonArgs.GetString(args, "target") ?? "action";
        var id = ServeJsonArgs.GetString(args, "id") ?? string.Empty;
        var subProgramId = ServeJsonArgs.GetString(args, "subProgramId", "subProgram");
        var editVersion = ServeJsonArgs.GetLong(args, "editVersion");

        var fingerprint = ProgramDiagnosticsFile.ComputeDataFingerprint(projectDir!);
        var running = new ProgramDiagnosticsDocument
        {
            Schema = ProgramDiagnosticsSchema.Id,
            Target = target,
            Id = id,
            SubProgramId = subProgramId,
            EditVersion = editVersion,
            DataFingerprint = fingerprint,
            Status = "running",
            StartedAt = DateTime.UtcNow.ToString("o"),
            Summary = new ProgramDiagnosticsSummary(),
            Issues = new List<ProgramSyntaxIssue>(),
        };
        ProgramDiagnosticsFile.Write(projectDir!, running);

        var key = projectDir!;
        if (InFlight.TryGetValue(key, out var existing))
        {
            existing.Cancel();
            existing.Dispose();
        }

        var cts = new CancellationTokenSource();
        InFlight[key] = cts;

        return Ok(new
        {
            ok = true,
            action = "project-lint-schedule",
            status = "scheduled",
            projectDirectoryAbsolute = projectDir,
            editVersion,
            dataFingerprint = fingerprint,
            readOp = "project.diagnostics.get",
        });
    }

    internal static ServeInvokeResponse GetDiagnostics(JsonElement args)
    {
        var projectDir = ResolveProjectDirectory(args, out var error);
        if (error is not null)
        {
            return Fail(error.Value.code, error.Value.message);
        }

        var waitMs = Math.Clamp(ServeJsonArgs.GetInt(args, "waitMs") ?? 0, 0, 120_000);
        var editVersion = ServeJsonArgs.GetLong(args, "editVersion");
        var deadline = DateTime.UtcNow.AddMilliseconds(waitMs);

        ProgramDiagnosticsDocument doc;
        do
        {
            doc = ProgramDiagnosticsFile.ReadOrDefault(projectDir!);
            if (ProgramDiagnosticsFile.IsStale(doc, projectDir!, editVersion))
            {
                doc.Status = "stale";
            }

            if (!string.Equals(doc.Status, "running", StringComparison.OrdinalIgnoreCase)
                || waitMs <= 0
                || DateTime.UtcNow >= deadline)
            {
                break;
            }

            Thread.Sleep(200);
        }
        while (true);

        return Ok(BuildDiagnosticsPayload(doc, projectDir!));
    }

    internal static async Task RunLintAsync(
        QkrpcRpcSessionPool pool,
        string projectDirectory,
        string target,
        string id,
        string? subProgramId,
        long? editVersion,
        CancellationToken cancellationToken)
    {
        var fingerprint = ProgramDiagnosticsFile.ComputeDataFingerprint(projectDirectory);
        try
        {
            if (!QuickerProjectFiles.TryReadDataIfExists(projectDirectory, out var data) || data is null)
            {
                WriteFailed(projectDirectory, target, id, subProgramId, editVersion, fingerprint,
                    "data.json not found.");
                return;
            }

            var items = ProgramSyntaxCollector.Collect(projectDirectory, data);
            var issues = new List<ProgramSyntaxIssue>();
            var checkedCount = 0;
            var skipped = 0;

            var rpc = await pool.GetRpcAsync(cancellationToken).ConfigureAwait(false);
            var token = QuickerRpcClient.CreateRpcCancellationToken(120);

            foreach (var item in items.Take(MaxChecksPerRun))
            {
                cancellationToken.ThrowIfCancellationRequested();

                if (string.IsNullOrWhiteSpace(item.Code))
                {
                    if (!string.IsNullOrWhiteSpace(item.File))
                    {
                        issues.Add(MissingFileIssue(item));
                    }

                    skipped++;
                    continue;
                }

                checkedCount++;
                QuickerRpcCodeSyntaxCheckResult result;
                if (item.Kind == ProgramSyntaxCheckKind.Expression)
                {
                    IDictionary<string, string>? variableTypes = item.VariableTypes is null
                        ? null
                        : new Dictionary<string, string>(item.VariableTypes);
                    result = await rpc
                        .CheckExpressionSyntaxAsync(item.Code, variableTypes, token)
                        .ConfigureAwait(false);
                }
                else
                {
                    result = await rpc
                        .CheckCSharpScriptSyntaxAsync(item.Code, references: null, token)
                        .ConfigureAwait(false);
                }

                if (!result.Success)
                {
                    issues.Add(new ProgramSyntaxIssue
                    {
                        Severity = ProgramSyntaxIssueSeverity.Error,
                        Kind = item.Kind,
                        Code = result.ErrorCode ?? "COMPILE_ERROR",
                        Message = result.Message,
                        Location = ToLocation(item),
                    });
                }
            }

            var ready = new ProgramDiagnosticsDocument
            {
                Schema = ProgramDiagnosticsSchema.Id,
                Target = target,
                Id = id,
                SubProgramId = subProgramId,
                EditVersion = editVersion,
                DataFingerprint = fingerprint,
                Status = "ready",
                StartedAt = ProgramDiagnosticsFile.ReadOrDefault(projectDirectory).StartedAt,
                CompletedAt = DateTime.UtcNow.ToString("o"),
                Summary = new ProgramDiagnosticsSummary
                {
                    ErrorCount = issues.Count,
                    WarningCount = 0,
                    Checked = checkedCount,
                    Skipped = skipped,
                },
                Issues = issues,
            };
            ProgramDiagnosticsFile.Write(projectDirectory, ready);
        }
        catch (OperationCanceledException)
        {
            // superseded by a newer schedule
        }
        catch (Exception ex)
        {
            WriteFailed(projectDirectory, target, id, subProgramId, editVersion, fingerprint, ex.Message);
        }
        finally
        {
            InFlight.TryRemove(projectDirectory, out _);
        }
    }

    internal static void StartBackgroundLint(
        QkrpcRpcSessionPool pool,
        JsonElement args,
        CancellationToken hostCancellation)
    {
        var projectDir = ResolveProjectDirectory(args, out _);
        if (projectDir is null)
        {
            return;
        }

        var target = ServeJsonArgs.GetString(args, "target") ?? "action";
        var id = ServeJsonArgs.GetString(args, "id") ?? string.Empty;
        var subProgramId = ServeJsonArgs.GetString(args, "subProgramId", "subProgram");
        var editVersion = ServeJsonArgs.GetLong(args, "editVersion");

        if (!InFlight.TryGetValue(projectDir, out var cts))
        {
            return;
        }

        _ = Task.Run(
            async () =>
            {
                try
                {
                    using var linked = CancellationTokenSource.CreateLinkedTokenSource(
                        hostCancellation,
                        cts.Token);
                    await RunLintAsync(
                            pool,
                            projectDir,
                            target,
                            id,
                            subProgramId,
                            editVersion,
                            linked.Token)
                        .ConfigureAwait(false);
                }
                catch
                {
                    // logged via failed document
                }
            },
            CancellationToken.None);
    }

    private static void WriteFailed(
        string projectDirectory,
        string target,
        string id,
        string? subProgramId,
        long? editVersion,
        string fingerprint,
        string message)
    {
        var failed = new ProgramDiagnosticsDocument
        {
            Schema = ProgramDiagnosticsSchema.Id,
            Target = target,
            Id = id,
            SubProgramId = subProgramId,
            EditVersion = editVersion,
            DataFingerprint = fingerprint,
            Status = "failed",
            LintError = message,
            CompletedAt = DateTime.UtcNow.ToString("o"),
        };
        ProgramDiagnosticsFile.Write(projectDirectory, failed);
    }

    private static ProgramSyntaxIssue MissingFileIssue(ProgramSyntaxCheckItem item) =>
        new()
        {
            Severity = ProgramSyntaxIssueSeverity.Error,
            Kind = item.Kind,
            Code = "FILE_NOT_FOUND",
            Message = $"Referenced file not found: {item.File}",
            Location = ToLocation(item),
        };

    private static ProgramSyntaxIssueLocation ToLocation(ProgramSyntaxCheckItem item) =>
        new()
        {
            StepRef = item.StepRef,
            StepRunnerKey = item.StepRunnerKey,
            ParamName = item.ParamName,
            VariableKey = item.VariableKey,
            File = item.File,
        };

    private static object BuildDiagnosticsPayload(ProgramDiagnosticsDocument doc, string projectDir) =>
        new
        {
            ok = true,
            action = "project-diagnostics-get",
            status = doc.Status,
            schema = doc.Schema,
            target = doc.Target,
            id = doc.Id,
            subProgramId = doc.SubProgramId,
            editVersion = doc.EditVersion,
            dataFingerprint = doc.DataFingerprint,
            currentDataFingerprint = ProgramDiagnosticsFile.ComputeDataFingerprint(projectDir),
            startedAt = doc.StartedAt,
            completedAt = doc.CompletedAt,
            lintError = doc.LintError,
            summary = doc.Summary,
            issues = doc.Issues.Take(MaxIssuesReturned),
            issueCount = doc.Issues.Count,
            projectDirectoryAbsolute = projectDir,
            diagnosticsPath = ProgramDiagnosticsFile.GetDiagnosticsPath(projectDir),
        };

    private static string? ResolveProjectDirectory(JsonElement args, out (string code, string message)? error)
    {
        error = null;
        var explicitDir = ServeJsonArgs.GetString(args, "projectDir", "projectDirectory", "dir");
        var workspaceRoot = ResolveWorkspaceRoot(args);

        if (!string.IsNullOrWhiteSpace(explicitDir))
        {
            try
            {
                var resolved = QuickerProjectLayout.ResolveProjectDirectory(explicitDir);
                if (!string.IsNullOrWhiteSpace(workspaceRoot)
                    && !IsUnderRoot(resolved, Path.GetFullPath(workspaceRoot)))
                {
                    error = ("PATH_OUTSIDE_WORKSPACE", "project directory must be under workspaceRoot.");
                    return null;
                }

                return resolved;
            }
            catch (Exception ex)
            {
                error = ("INVALID_DIR", ex.Message);
                return null;
            }
        }

        error = ("MISSING_PROJECT_DIR", "args.projectDir (absolute) is required.");
        return null;
    }

    private static bool IsUnderRoot(string path, string rootFull)
    {
        var normalizedRoot = rootFull.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        return path.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase)
               || string.Equals(path, rootFull, StringComparison.OrdinalIgnoreCase);
    }

    private static string? ResolveWorkspaceRoot(JsonElement args) =>
        ServeJsonArgs.GetString(args, "workspaceRoot", "workspace", "cwd");

    private static ServeInvokeResponse Ok(object data) =>
        new() { Ok = true, Data = data };

    private static ServeInvokeResponse Fail(string code, string message) =>
        new() { Ok = false, Error = code, Message = message };
}

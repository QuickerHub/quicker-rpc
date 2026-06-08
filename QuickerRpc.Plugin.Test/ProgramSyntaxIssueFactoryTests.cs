using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.AgentModel.XAction.Lint;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class ProgramSyntaxIssueFactoryTests
{
    [TestMethod]
    public void Create_inline_step_includes_path_and_read_data_hint()
    {
        var item = new ProgramSyntaxCheckItem
        {
            Kind = ProgramSyntaxCheckKind.Expression,
            StepId = "s-1",
            StepRef = "s-1",
            StepPath = "2/if/0",
            StepRunnerKey = "sys:evalexpression",
            ParamName = "expression",
        };

        var issue = ProgramSyntaxIssueFactory.Create(
            item,
            ProgramSyntaxIssueSeverity.Error,
            ProgramSyntaxCheckKind.Expression,
            "COMPILE_ERROR",
            "error CS1002: ; expected (12, 5)");

        Assert.AreEqual("2/if/0", issue.Location.StepPath);
        Assert.AreEqual("steps[2/if/0].inputParams.expression", issue.Location.DataJsonPath);
        Assert.AreEqual(12, issue.Location.Line);
        Assert.AreEqual(5, issue.Location.Column);
        Assert.IsNotNull(issue.Location.Read);
        Assert.AreEqual("workspace_program", issue.Location.Read!.Tool);
        Assert.AreEqual("read_data", issue.Location.Read.Action);
        Assert.IsTrue(issue.LocationSummary!.Contains("2/if/0"));
        Assert.IsTrue(issue.LocationSummary.Contains("workspace_program"));
        Assert.IsTrue(issue.LocationSummary.Contains("read_data"));
    }

    [TestMethod]
    public void CreateTruncationWarning_describes_cap()
    {
        var issue = ProgramSyntaxIssueFactory.CreateTruncationWarning(250, 120);

        Assert.AreEqual("LINT_TRUNCATED", issue.Code);
        Assert.AreEqual(ProgramSyntaxIssueSeverity.Warning, issue.Severity);
        Assert.IsTrue(issue.Message.Contains("120"));
        Assert.IsTrue(issue.Message.Contains("250"));
    }

    [TestMethod]
    public void Create_file_step_suggests_file_read_with_line_window()
    {
        var item = new ProgramSyntaxCheckItem
        {
            Kind = ProgramSyntaxCheckKind.CSharp,
            StepPath = "1",
            StepId = "s-2",
            StepRef = "s-2",
            ParamName = "script",
            File = "files/run.cs",
        };

        var issue = ProgramSyntaxIssueFactory.Create(
            item,
            ProgramSyntaxIssueSeverity.Error,
            ProgramSyntaxCheckKind.CSharp,
            "COMPILE_ERROR",
            "error at line 20, column 3");

        Assert.AreEqual("steps[1].inputParams.script.file", issue.Location.DataJsonPath);
        Assert.AreEqual(20, issue.Location.Line);
        Assert.AreEqual(3, issue.Location.Column);
        Assert.AreEqual("workspace_program", issue.Location.Read!.Tool);
        Assert.AreEqual("file_read", issue.Location.Read.Action);
        Assert.AreEqual("files/run.cs", issue.Location.Read.Path);
        Assert.AreEqual(16, issue.Location.Read.StartLine);
        Assert.AreEqual(24, issue.Location.Read.EndLine);
    }
}

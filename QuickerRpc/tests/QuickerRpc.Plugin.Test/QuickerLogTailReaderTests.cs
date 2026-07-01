using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using QuickerRpc.Diagnostics;

namespace QuickerRpc.Plugin.Test;

[TestClass]
public sealed class QuickerLogTailReaderTests
{
    [TestMethod]
    public void TryReadActionErrorExcerpt_returns_stack_block_for_action_title()
    {
        var logPath = Path.Combine(Path.GetTempPath(), $"quicker-log-test-{Guid.NewGuid():N}.log");
        try
        {
            File.WriteAllText(
                logPath,
                """
                2026-07-01 05:00:00,000 [action:other] WARN Example - unrelated
                2026-07-01 05:37:05,449 [action:图标] WARN Quicker.Domain.Actions.X.XActionHelper - 动作(图标)运行失败：解析表达式出错。
                2026-07-01 05:37:05,408 [1] ERROR QuickerExpressionEnhanced.ExpressionRunner - Failed to execute expression.
                System.ArgumentException: 处理程序类型不匹配。
                   在 IconPicker.Runner.StartDesignerIconHook()
                """);

            var excerpt = QuickerLogTailReader.TryReadActionErrorExcerpt("图标", logPath: logPath);

            Assert.IsNotNull(excerpt);
            StringAssert.Contains(excerpt, "[action:图标]");
            StringAssert.Contains(excerpt, "System.ArgumentException");
            StringAssert.Contains(excerpt, "StartDesignerIconHook");
        }
        finally
        {
            if (File.Exists(logPath))
            {
                File.Delete(logPath);
            }
        }
    }

    [TestMethod]
    public void TryReadActionErrorExcerpt_matches_action_id()
    {
        var logPath = Path.Combine(Path.GetTempPath(), $"quicker-log-test-{Guid.NewGuid():N}.log");
        try
        {
            File.WriteAllText(
                logPath,
                """
                2026-07-01 05:37:05,449 [action:图标] WARN Quicker.Domain.AppServer - 执行动作 id=675597e0-2691-4bfe-99bc-80c4258bbaf0 失败
                System.InvalidOperationException: sample
                """);

            var excerpt = QuickerLogTailReader.TryReadActionErrorExcerpt(
                actionTitle: null,
                actionId: "675597e0-2691-4bfe-99bc-80c4258bbaf0",
                logPath: logPath);

            Assert.IsNotNull(excerpt);
            StringAssert.Contains(excerpt, "675597e0-2691-4bfe-99bc-80c4258bbaf0");
        }
        finally
        {
            if (File.Exists(logPath))
            {
                File.Delete(logPath);
            }
        }
    }
}

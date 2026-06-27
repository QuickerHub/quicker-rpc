using System.Collections.Generic;
using Quicker.Public.Actions;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.StepRunners;

namespace QuickerRpc.Plugin.Services;

/// <summary>Static catalog metadata for plugin-injected step runners (for qkrpc discovery).</summary>
internal static class PluginStepRunnerCatalog
{
    public static IEnumerable<StepRunnerDefinition> GetDefinitions()
    {
        yield return new StepRunnerDefinition
        {
            Key = EvalExpressionStepRunner.StepKey,
            Name = "执行表达式",
            Description = "执行C#表达式或脚本代码，支持使用变量和上下文对象。",
            Icon = "fa:Light_Code",
            Category = "Compute",
            InputParamDefs = new List<StepRunnerInputParamDef>
            {
                new StepRunnerInputParamDef
                {
                    Key = "expression",
                    Name = "表达式",
                    Description = "要执行的C#表达式或脚本代码，支持使用{变量名}和上下文对象。可以以$=开头。支持 {varname}=value 赋值语法。",
                    VarType = (int)VarType.Text,
                    IsRequired = true,
                },
                new StepRunnerInputParamDef
                {
                    Key = "onUiThread",
                    Name = "在UI线程执行",
                    Description = "是否在UI线程上执行表达式。谨慎使用，可能造成死锁。",
                    VarType = (int)VarType.Boolean,
                    DefaultValue = "false",
                },
                new StepRunnerInputParamDef
                {
                    Key = "stopIfFail",
                    Name = "失败后停止",
                    Description = "失败后是否停止动作",
                    VarType = (int)VarType.Boolean,
                    DefaultValue = "true",
                },
            },
            OutputParamDefs = new List<StepRunnerOutputParamDef>
            {
                new StepRunnerOutputParamDef
                {
                    Key = "output",
                    Name = "结果",
                    Description = "表达式执行结果",
                    VarType = (int)VarType.Any,
                },
                new StepRunnerOutputParamDef
                {
                    Key = "isSuccess",
                    Name = "步骤是否成功",
                    Description = "步骤是否成功完成",
                    VarType = (int)VarType.Boolean,
                },
                new StepRunnerOutputParamDef
                {
                    Key = "errMessage",
                    Name = "错误消息",
                    Description = "步骤执行出错时的消息",
                    VarType = (int)VarType.Text,
                },
            },
        };
    }
}

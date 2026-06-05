# sys:pythonscript

> **分类**：脚本与代码 · **官方**：[pythonscript](https://getquicker.net/KC/Help/Doc/pythonscript)

**用途**：Run Python script step

## 要点（摘自官方文档）

执行python代码片段。

使用本模块有一些基础需求：

- 您需要了解python；
- 本模块使用了pythonnet库实现，仅支持python3。
- 64位windows应安装64位版本python，32位windows安装32位python。

**注意事项**

- 请使用从官网下载安装的python（https://www.python.org/downloads/windows/），第三方python环境可能无法正常运行。
- 目前支持的python版本为3.7 - 3.12（https://pythonnet.github.io/）。
- 在py脚本中，尽量只访问简单类型的quicker变量，如数字/文本。目前底层依赖库可能存在bug，使用复杂类型（如列表/词典）有概率遇到闪退问题。
- py脚本将在quicker进程中执行，拥有比普通非管理员身份运行的程序具有更高的权限。因此在py代码中不能使用com接口访问和控制第三方软件（如访问和使用Word.Application对象）。

## Python的路径

可以直接设定cpython主运行库的路径，也可以让Quicker自动查找python。

**1) 直接指定python主运行库的路径（1.35.37+版本）**

**2）自动查找python运行库**

未设定运行库路径时，Quicker 会尝试从系统PATH环境变量所包含的目录中寻找符合条件的目录。

目录名需要包含版本信息，如3.9版目录名应该为xx\xxx\python39（目录内有python39.dll，目录名和dll文件名匹配）。

【脚本内容】需要执行的python脚本内容。

py脚本中，通过`quicker.context.GetVarValue('变量名')`读取动作变量。通过`quicker.context.SetVarValue('变量名',value)`更新动作变量。

简单的内容，可以在python脚本中可以直接使用`quicker.context.SetVarValue('变量名',value)`返回到对应类型的变量中。Quicker 3.35.37版本后，也可以使用此方式返回文本列表和简单的词典变量。

```python
##.py
quicker.context.SetVarValue('text', 'hello world')
quicker.context.SetVarValue('list', ['hello1','hello2','hello3'])
quicker.context.SetVarValue('dict', {'a':1, 'b':2, 'day':'2022-1-1'})
```

建议不要返回更复杂的数据类型（从python到c#的转换可能会出现奇怪的问题），而是在python中完成所有处理以后将简单的值返回到动作。

[测试动作](https://getquicker.net/Sharedaction?code=e4ec073a-1f86-449c-8001-08da66cce8dc)

- 20230215 增加一些注意事项说明。

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`

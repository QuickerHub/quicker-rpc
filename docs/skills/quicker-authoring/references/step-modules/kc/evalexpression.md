# sys:evalexpression

> **分类**：计算与数据结构 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [expression](https://getquicker.net/KC/Help/Doc/expression)

**用途**：Evaluate C# expression / LINQ / assign ({var}=value); preferred over assign & compute steps

# 概述

可以使用表达式进行比较或运算，将结果作为参数值输入到动作模块中。

在输入框的**开始**使用**$=**表示后面的内容是一个表达式。

[image]

表达式可以用于各种**通过输入框指定参数值**的地方。

插值（以**$$**开始）应该只用于拼接文本；所有需要计算、比较的地方，应该使用表达式（以**$**=开始）简化操作并提升性能。

自1.9.5版本开始，表达式在内部使用[Eval-expression](https://eval-expression.net/)引擎实现，支持更多语法（如Lambda表达式，详见本页内同名章节），1.9.5之前的版本通过[DynamicExpresso](https://github.com/davideicardi/DynamicExpresso)引擎实现。

注：

- 如果希望输出结果为$=开始的文本内容（而不是进行表达式运算），可以使用表达式$="$=ABC"的形式，通过表达式返回内容为$=ABC的文本。请参考此帖子。

# 表达式基础

表达式是由一个或多个操作数（变量或常量）以及零个或多个运算符组成的序列，其结果为一个值。例如：

- $=5
- $={秒数}*1000
- $="你好，" + {姓名}
- $={次数} > 5
- $={选项} == "选项1"

## 常量

表达式中不变的内容称作常量。

- 布尔常量：true  false
- 数字常量：10   50.1
- 文本常量使用英文半角双引号包围："China"
- 字符常量： 'A'  'c'

### 转义字符

在文本或字符的常量值中，可以使用转义字符表示特殊符号。支持的转义字符：

- \' - 单引号 single quote, needed for character literals
- \" - 双引号 double quote, needed for string literals
- \\ - 斜线 backslash
- \n - 换行 New line (character 10)
- \r - 回车 Carriage return (character 13)
- \t - Tab跳格 Horizontal tab (character 9)

## 变量

表达式中值会动态变化的内容称作为变量，如前面例子中的{秒数}，{姓名}，{次数}和{选项}，它们的变量名是固定的，但值是动态变化的。更多内容请阅读[变量](https://getquicker.net/KC/Help/Doc/variables)。

## 启用表达式

在输入框的开始处写**$= **（且只在开始处写）作为启用表达式的开关，后面写表达式的内容。

[image]

## 在表达式中使用变量

与插值写法类似，表达式中使用 **{变量名}** 的方式表示动作中的变量。注意变量名需要以英文字母或汉字开始，不能以数字开始，不能包含特殊符号。

表达式编辑框，在输入**{**后会自动显示当前动作内的变量列表，此时输入变量名的一部分或拼音的一部分，可以筛选变量名，按tab、回车或空格可以自动填入选中的（蓝色高亮）变量名。

[image]

## 表达式的运算结果

根据表达式的实际计算内容，其结果可能是文本/数字/日期/布尔等类型。应尽量使表达式的结果的类型与动作模块参数类型相同。

如果参数的类型与表达式结果的不同，Quicker将尝试自动转换（如将文本转换为数字等）。

## 表达式支持的数据类型(C#)

| 类型 | 值 | 备注 |
| --- | --- | --- |
| bool 布尔 | true/false |  |
| char 字符 | 'A' | 单引号包围的单个字符。如可用于判断文本内容的第1个字符是不是'A':; $= {文本变量}[0] == 'A' |
| string 字符串 | "Quicker Is Cool!" | 半角双引号包围的一串文本。等同于Quicker的文本变量类型。 |
| Int16 UInt16 Int32 int UInt32 Int64 long UInt64; Single Double double Decimal decimal; 各种数字类型 | 123; 123.45 | Quicker的小数数字类型变量在内部使用c#的double类型，整数数字使用long类型。 |
| DateTime TimeSpan 时间日期、时间间隔类型 | 2020-2-20 20:20:20 | Quicker日期时间类型变量内部使用c# DateTime类型。 |
| Guid 唯一ID | 0C024548-D718-4CDD-BC73-87D21AC1A183 |  |
| [Math 数学类](https://docs.microsoft.com/en-us/dotnet/api/system.math?view=netcore-3.1); [Random 随机数类](https://docs.microsoft.com/en-us/dotnet/api/system.random?view=netcore-3.1); Convert  数据类型转换类 |  | 提供一些可用的函数对常量或变量进行计算或类型转换。 |
| [Path 静态类](https://docs.microsoft.com/en-us/dotnet/api/system.io.path) |  | 用于处理文件路径。 |
| [Regex 正则表达式处理类](https://docs.microsoft.com/en-us/dotnet/api/system.text.regularexpressions.regex) |  | 用于正则相关处理。 |

# 表达式进阶

## 运算符

*注：以下部分内容摘录自*[*https://www.runoob.com/csharp/csharp-regular-expressions.html*](https://www.runoob.com/csharp/csharp-regular-expressions.html)* 有删改。*

### 算术运算符

下表显示了 C# 支持的所有算术运算符。假设变量 **A** 的值为 10，变量 **B** 的值为 20，则：

| 运算符 | 描述 | 实例 |
| --- | --- | --- |
| + | 把两个操作数相加; 把两个字符串相加 | A + B 将得到 30; "Hello " + {Name} |
| - | 从第一个操作数中减去第二个操作数 | A - B 将得到 -10 |
| * | 把两个操作数相乘 | A * B 将得到 200 |
| / | 分子除以分母 | B / A 将得到 2 |
| % | 取模运算符，整除后的余数 | B % A 将得到 0 |

### 关系运算符

下表显示了 C# 支持的所有关系运算符。假设变量 **A** 的值为 10，变量 **B** 的值为 20，则：

| 运算符 | 描述 | 实例 |
| --- | --- | --- |
| == | 检查两个操作数的值是否相等，如果相等则条件为真。 | (A == B) 不为真。 |
| != | 检查两个操作数的值是否相等，如果不相等则条件为真。 | (A != B) 为真。 |
| > | 检查左操作数的值是否大于右操作数的值，如果是则条件为真。 | (A > B) 不为真。 |
| = | 检查左操作数的值是否大于或等于右操作数的值，如果是则条件为真。 | (A >= B) 不为真。 |
|  0 && {数字}  {b} ? {a} : {b}
- 取3个变量的最大值：$= {a} > {b} ? ({a} > {c} ? {a} : {c} ): ({b} > {c} ? {b} : {c} )

### 运算符的优先级

遵循c#语言的语法，请参考：[https://docs.microsoft.com/zh-cn/dotnet/csharp/language-reference/operators/index#code-try-0](https://docs.microsoft.com/zh-cn/dotnet/csharp/language-reference/operators/index#code-try-0)

一般的：

- 括号具有更高的优先级  (2+3)*5 的值为25。
- 乘除优先级大于加减。 2+3*5 的值为17。
- 加减的优先级大于比较。 2+4 > 5 的值为true。

## 调用变量（或常量的）属性或方法

变量或常量，在c#内部都是某种对象，每种对象会支持一些c#的属性或方法函数。调用方法一般为：

- 属性： {变量}.属性名
- 变量实例方法： {变量}.方法名(参数列表)
- 类型的静态方法：类型名.方法名(参数列表)

### 文本类型的常用属性和方法

更详细的说明请参考：[https://docs.microsoft.com/zh-cn/dotnet/api/system.string?view=netframework-4.8#methods](https://docs.microsoft.com/zh-cn/dotnet/api/system.string?view=netframework-4.8#methods)

| 属性或方法 | 说明 | 示例 |
| --- | --- | --- |
| Length | 取文本内容的长度 | {文本变量}.Length   取变量的值的长度; "Quicker".Length    取常量的值的长度 |
| Contains(string) | 检查文本是否包含指定的内容。返回布尔值 | {文本变量}.Contains("Quicker") |
| StartsWith(string) | 检查文本是否以指定内容开头 | {文本变量}.StartsWith("http")检查是否http开头 |
| EndsWith(string) | 检查文本是否以指定内容结束 | {文本变量}.EndsWith('A') |
| IndexOf(string); IndexOf(char) | 检查指定内容在文本中的位置。 |  |
| LastIndexOf(string); LastIndexOf(char) | 指定的内容在文本中最后出现的文字 |  |
| PadLeft(int,char) | 返回一个新字符串，该字符串通过在此实例中的字符左侧填充指定的 Unicode 字符来达到指定的总长度，从而使这些字符右对齐。 | {文本变量}.PadLeft(20, '0') |
| Replace(string, string) | 替换内容 | {文本变量}.Replace("Qk", "Quicker") |
| Split(char[]); Split(string[], StringSplitOptions) | 拆分文本为列表 | {文本内容}.Split(' ')  使用空格将文本拆分成列表；; {文本内容}.**Split**('，','。') 使用中文逗号和句号拆分为列表；; {文本内容}.**Split**(**new** string[] **{ "\r\n" }**,StringSplitOptions.RemoveEmptyEntries) 按回车换行拆分为列表。; StringSplitOptions.RemoveEmptyEntries选项表示去除空元素，也可使用StringSplitOptions.None保留空元素。 |
| Substring(int 开始位置); Substring(int 开始,int 长度) | 截取从指定位置开始的一部分文本 | {str}.Substring({str}.Length-2) 取文本的末尾2个字符。; {str}.Substring(0,{str}.Length-5)从0开始截取，去掉后5位字符，如123456789 将剩余1234 |
| ToLower(); ToUpper() | 转换为小写或大写格式。 |  |
| Trim(); TrimStart(); TrimEnd() | 移除开始和/或结束的空白字符。 |  |
| [序号] | 取第几个字符 | {文本变量}[0] == 'Q'    判断文本的第一个字符是否为Q |
| Regex.Match; 正则提取 | 正则提取内容 | Regex.Match(**{文本变量}**, "正则表达式").ToString()  因为返回是Regex类 所以需要转换成文本 【正则表达式\代表转义需要写成\\如：\d需要写成\\d，如果正则内容带"双引号也需要转义\"】 |
| Regex.IsMatch; 正则判断 | 正则判断内容并返回布尔值 | Regex.IsMatch(**{文本变量}**, "正则表达式")例如：Regex.IsMatch(**{后缀名}**, ".*?\\.(png\|jpg\|bmp\|gif)") 判断后缀是否为图片返回True或者False |
| Regex.Replace; 正则替换 | 正则替换内容 | Regex.Replace(**{文本变量}**, "正则表达式", "替换内容") 返回是文本所以不需要转换 |
| Regex.Split; 正则拆分 | 正则拆分内容为列表 | Regex.Split(**{文本变量}**,"正则表达式"); 例子:拆分回车换行; Regex.Split(**{文本变量}**,@"\r\n") |
| JsonConvert.DeserializeObject() | 将字符串解析为JToken | JsonConvert.DeserializeObject({JSON字符串}) |

### 词典的常用属性和方法

| 属性或方法 | 说明 | 示例 |
| --- | --- | --- |
|  | 获取某个键的值 | $= {词典变量}["键名"]; 词典变量的值是c#的Object类型，因此不能直接将其内容和别的文本进行比较，需要先转换成string类型或使用String.Equals函数进行比较，如：$= ((string){词典A}["Key1"]) == "abc"，; 或$= {词典A}["Key1"].ToString() == "abc"，; 或 $**=** String.Equals({词典A}["Key1"],{词典B}["Key1"]) |
| ContainsKey() | 是否包含某个键 | $= {词典变量}.ContainsKey("键") |
| Keys | 获取所有键的列表 | $= {词典变量}.Keys |
| Values | 获取所有值的列表 | $= {词典变量}.Values |
| JsonConvert.SerializeObject() | 词典序列化json字符串 | $=JsonConvert.SerializeObject({词典变量}) |

### 列表的常用属性和方法

| 属性或方法 | 说明 | 示例 |
| --- | --- | --- |
|  | 获取某个值 | $={列表变量}[序号]，; 序号从0开始。如果使用数字变量指定序号，需要(int)强制类型转换，如：{列表变量}[(int){序号变量}] |
| Contains() | 是否包含某项 | $= {列表变量}.Contains("某项内容") |
| String.Join() | 合并列表为文本 | $= String.Join("分隔符", {列表变量}) |
| IndexOf() | 某一项的序号。从0开始，不存在的话返回-1. | $= {列表变量}.IndexOf("某项内容") |
| Count() | 返回列表的长度（含有的元素个数） | $= {列表变量}.Count() |

### 用户分享（[链接](https://getquicker.net/QA/Question/1811)）

在这个帖子里有不少用户分享了一些常用的表达式。

### 数学计算

数学除了可以直接使用普通的计算表达式外，还可以使用c#的静态类Math。

可以在表达式中直接使用的常量:

- Math.E   自然对数底
- Math.PI  π

如，求圆的面积 `$= Math.PI * {R} * {R}`

可以在表达式中使用Math的静态方法。更多请参考：[https://docs.microsoft.com/zh-cn/dotnet/api/system.math?view=netframework-4.8#methods](https://docs.microsoft.com/zh-cn/dotnet/api/system.math?view=netframework-4.8#methods)

如：求2的指定次方： `$= Math.Pow(2, {次数})`

Quicker中的数字类型变量在内部为C#语言的double类型，整数数字类型在内部为c#的long型。

## 转换值的类型

- 数字->文本：可以使用.ToString()。 如 $= {数字变量}.ToString()
- 文本->小数数字：可以使用double.Parse(string)。 如 $=double.Parse({文本变量})
- 文本->整数数字:可以使用int.Parse(string)或long.Parse(string)。 如 $=int.Parse({文本变量})，也可以使用C#的Convert类转换数据的类型。如$= Convert.ToDouble({文本变量})

更多请参考：[https://docs.microsoft.com/en-us/dotnet/api/system.convert?view=netframework-4.8](https://docs.microsoft.com/en-us/dotnet/api/system.convert?view=netframework-4.8)

## Lambda表达式

*本功能自1.9.5版本开始支持。

从一个例子开始：

```csharp
$= {列表变量}.Where(x => !String.IsNullOrWhiteSpace(x)).Select(x => x.Trim().ToUpper() + "_后缀").ToList()
```

说明：

- .Where(x => !String.IsNullOrWhiteSpace(x))   筛选掉没有可见字符的行
- .Select(x => x.Trim().ToUpper() + "_后缀")  处理每项

- Trim()：去除前后的空白
- ToUpper(): 转换为大写字母
- +"_后缀": 叠加其他内容

- .ToList() 转换为列表类型

上面例子中使用了 `x => 表达式`  这样的语法，它表示对参数x做后面的处理，取其结果。

如果有多个参数，需要在参数列表两侧添加括号：`(x,y,z)`当计算结果的逻辑比较复杂时 => 后面可以写多个c#语句并使用{}包围起来。

下面是几个例子：

- 给列表的每项添加序号：

```csharp
$= {list}
.Select((x,index) => {
  var temp = x.ToUpper().Trim();
  temp = index.ToString() + ": " + temp;
  return temp;
})
.ToList()
```

- 将词典转换为“用户选择”模块的可选值格式：

```csharp
$= {dict}.Select(x => x.Value.ToString() + "|" + x.Key).ToList()
```

- 将词典转换为Cookie数据格式：

```csharp
$= String.Join(" ", {dict}.Select(x => x.Key+ "=" + x.Value +";"))
```

- 将数字内容的列表按数字大小排序：

```csharp
$= {list}.Select(x => Convert.ToInt32(x))
.OrderBy(x => x)
.Select(x => x.ToString())
.ToList()
```

- 将两个同样长度的列表的每个元素横向合并：

```csharp
$= {list1}.Select((x,index) => x + {list2}[index]).ToList()
```

示例动作：[https://getquicker.net/sharedaction?code=acf2fc09-3753-4b67-d714-08d827485760](https://getquicker.net/sharedaction?code=acf2fc09-3753-4b67-d714-08d827485760)

关于Lambda，请参考：[https://docs.microsoft.com/zh-cn/dotnet/csharp/programming-guide/statements-expressions-operators/lambda-expressions](https://docs.microsoft.com/zh-cn/dotnet/csharp/programming-guide/statements-expressions-operators/lambda-expressions)

Select()/Where()/ToList() 是C#中[System.Linq.Enumerable](https://docs.microsoft.com/en-us/dotnet/api/system.linq.enumerable?view=netcore-3.1#methods)静态类下的扩展函数。

# 与[插值](https://getquicker.net/kc/help/doc/interpolation)方式的比较

- 插值的作用是将变量的值插入到一段文本中。其结果也是一段文本。
- 插值将直接将变量的内容转换成文本插入当前位置，而在表达式中，将使用变量本身参与运算，不再转换成文本。
- 在需要接收布尔类型值的参数中（例如，在“如果”模块），插值后的结果文本会被作为一个表达式进行解析，转换为布尔值。

- 比较字符串时，插值方式使用单引号包围两个被比较的字符串。

[image]

- 使用表达式时，变量名不需要使用单引号包围，文本常量需要使用双引号包围。

[image]

- 在需要比较、计算的场景下，应该使用$=表达式的写法。

|  | **插值** | **表达式** |
| --- | --- | --- |
| 启动指令 | 参数的开始加**$$** | 参数的开始加**$**= |
| 主要用途 | 拼接文本 | 计算、比较，或较为复杂的变量操作 |
| 实现方式 | 将变量的值插入到文本中，组合成一段大的文本。 | 将Quicker变量使用c#语言变量的方式进行处理。; 支持变量原始对象的c#方法和属性调用。; 比较一个文本不为空并且长度超过5：; $= !String.IsNullOrEmpty({thePath}) && {thePath}.Length > 5 |
| 优缺点 | 优点：; 拼接文本比较方便; 缺点：; 功能比较受限 | 优点：; 可以使用变量自身的c#属性和方法；; 功能强大； |

示例：

|  | 插值 | 表达式 |
| --- | --- | --- |
| 组合文本 | $$ 你好， {name}; *将{name}的值替换到文本中* | $= "你好," + {name}; *相当于两个文本对象相加* |
| 比较大小 | $$ {数字变量} > 5; *插值后进行解析，仅在部分模块中支持。* | $= {数字变量} > 5 |

# 表达式的辅助编写

自1.24.27版本开始提供表达式自动补全和语法校验功能。

[image]

补全窗口显示后，可以按方向键选择目标条目，然后通过`tab`或`回车`选择。

您可以在配置中开启此功能：

[image]

**请注意：**

- 需要联网从服务器端获取补全信息。
- 基于技术限制，补全信息不能完全准确的反应表达式中可以使用的方法或关键词。您还需要实际运行动作来验证表达式是否可以正常工作。

# 表达式的高级话题

更多关于表达式的内容，请参考：[表达式高级话题](https://getquicker.net/kc/help/doc/expression-adv)

# 更新历史

- 20230202：修复StartsWith/EndsWith错误。

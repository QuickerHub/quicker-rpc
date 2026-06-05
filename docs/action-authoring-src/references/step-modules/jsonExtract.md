# sys:jsonExtract

> **分类**：文本处理 · **官方**：[jsonextract](https://getquicker.net/KC/Help/Doc/jsonextract)

**用途**：Extract fields from JSON text

## 要点（摘自官方文档）

用于从JSON格式的数据中提取需要的值。

json是一种轻量级的数据交换格式。通常用于网络数据交换或配置文件存储等场景。

本模块使用[Json.Net](https://www.newtonsoft.com/json)组件的 [JToken.SelectToken](https://www.newtonsoft.com/json/help/html/SelectToken.htm) 和 JToken.SelectTokens 方法实现。深入使用请参考此组件的相关文档。

## 输入

【输入】要提取信息的json数据 或 JToken对象。

【提取路径n】一次可以提取5项信息，对每一项指定要提取的JsonPath。

Quicker在内部将先使用[JToken.SelectToken()](https://www.newtonsoft.com/json/help/html/SelectToken.htm)方法提取单个值的内容，失败时尝试使用[JToken.SelectTokens()](https://www.newtonsoft.com/json/help/html/Overload_Newtonsoft_Json_Linq_JToken_SelectTokens.htm)方法提取列表类型的内容。

(1.30.14+) 对于明确需要提取数组/列表类型的结果的情况，可以在路径上增加前缀`list:`强制使用数组方式提取。

### 路径参数的格式

格式1：使用“属性.子属性[序号].子子属性”的层级式路径。如：

- Manufacturers[0].Name
- Manufacturers[0].Products[0].Price
- Manufacturers[1].Products[0].Name

格式2：使用JSONPath。

## 输出

【值n】根据路径n所提取到的内容。请确保输出的内容与变量类型兼容。

【根对象】输入的所有内容解析后生成JToken对象。当需要提取更多的内容时，可以将此对象输出到变量，然后使用更多的Json提取模块提取内容，也可以在表达式中使用JToken对象提取内容。

说明

## 表达式替代用法

通过`JsonConvert.DeserializeObject({JSON字符串})`这个函数可以将字符串转化为Jtoken，然后通过`{JToken}["path1"]["path2"]`即可获取内容。

## JToken说明

[JToken对象使用方法](https://www.yuque.com/quicker/help/chromecontrol#ayvff)

示例动作：[https://getquicker.net/Sharedaction?code=05d33931-477a-4c18-a917-08d7b30d7779](https://getquicker.net/Sharedaction?code=05d33931-477a-4c18-a917-08d7b30d7779)

json数据：

{
  'Stores': [
    'Lambton Quay',
    'Willis Street'
  ],
  'Manufacturers': [
    {
      'Name': 'Acme Co',
      'Products': [
        {
          'Name': 'Anvil',
          'Price': 50
        }
      ]
    },
    {
      'Name': 'Contoso',
      'Products': [
        {
          'Name': 'Elbow Grease',
          'Price': 99.95
        },
        {
          'Name': 'Headlight Fluid',
          'Price': 4
        }
      ]
    }
  ],
  'City': 'BeiJing',
  'Dot.Name': 'Hello'
}

| **要提取的内容** | **路径** | **值** |
| --- | --- | --- |
| City | City | 文本: Beijig |
| Stores | Stores | 列表： 'Lambton Quay', 'Willis Street' |
| 第一个Manufacturer的Name | Manufacturers[0].Name | 文本： Acme Co |
| 所有Products的name列表 | $..Products[*].Name | 列表： 'Anvil' 'Elbow Grease' 'Headlight Fluid' |
| 所有Manufacture对象的列表 | Manufacturers | 对象列表，可以使用“每个”模块循环处理每一项。 |
| Dot.Name的值（Key含有点） | ['Dot.Name'] | Hello |

- 1.4.18 当提取的数据为复杂类型时，返回原始JToken对象。

- https://www.newtonsoft.com/json/help/html/SelectToken.htm
- JsonPath教程：https://blog.csdn.net/koflance/article/details/63262484

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`


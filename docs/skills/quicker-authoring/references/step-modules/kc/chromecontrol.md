# sys:chromecontrol

> **分类**：第三方软件 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [chromecontrol](https://getquicker.net/KC/Help/Doc/chromecontrol)

**用途**：Control Chrome/Edge/Firefox (open URL, tabs, etc.)

通过Quicker动作控制浏览器或网页。

注：

- 您可能需要了解Html/CSS/Javascript/JQuery等相关知识才能灵活的使用本模块。

# 概述

## 关于MV3版本的浏览器扩展

目前进展：

- Chrome/Edge 均已发布1.0.0版扩展。
- 1.0.1版已提交审核，主要解决xpath支持问题和网页浮标不能保存位置的问题。

参考文档：

- 浏览器扩展升级的相关问题（公众号文章）
- 什么是MV3？升级MV3有哪些影响？

🚨MV3版本浏览器扩展的重要变化：

- 不再支持“运行后台脚本”功能。（已通过PC端解析脚本方式兼容了后台脚本功能）
- “对标签页运行脚本”功能，需要开启浏览器的开发者模式(chrome 138之前的版本)，或在扩展详情页面中开启“允许运行用户脚本”选项（chrome/edge 138及以后的版本）。
- Chrome/Edge 135+版本。 目前不支持firefox。
- Quicker 1.44.5+版本。
-

✨MV3版本扩展新增的功能：

- 后台命令：用以实现之前“运行后台脚本”的部分功能。 包含2个部分，一部分是对常用浏览器API的封装，一部分是一些常用功能的封装。可以在这里查看命令列表，后续可根据需求增加新的命令。
- 激活标签页：激活指定网址或id的标签页。如果不存在，则自动打开网址。
- 等待网页变化：等待动态网页中发生某个变化，如元素出现、消失；文字出现、消失等。
- 对标签页运行脚本：可选择“MAIN”执行环境，访问网页js 变量。
- 增加标签页分组API支持；

**延期MV2版本扩展的使用**

目前Chrome已经开始禁用MV2版本扩展。 如果需要，可以通过注册表开启对MV2的扩展支持（预计有1年有效期），尝试点击此按钮导入注册表条目后重启浏览器：
[image][image]

## 安装浏览器扩展

请从[网站下载页面](https://getquicker.net/Download)获取各浏览器的扩展网址或crx下载链接。

方便的话，请在扩展商店中为扩展评分⭐⭐⭐⭐⭐哦，这样有助于更新版本时更快通过审核💖。

注：“紫鸟”浏览器，请自行联系紫鸟客服，申请加白名单后才能使用Quicker扩展。

## 界面说明

点击扩展图标会显示一个弹窗。

[image]

**连接状态：**显示当前是否正常连接到消息代理和Quicker。

- 两个已连接：正常状态。
- 消息代理已连接，Quicker未连接：可能Quicker未启动或版本太老（请确认使用了1.29.3+版本）。
- 消息代理和Quicker都未连接：未安装Quicker或版本太老。

**功能选项：**

- 开启网址同步：此选项为后期增加基于网址的动作页功能预留，目前请不要开启。

**可选权限：**

- 如果要运行使用到特殊权限的后台脚本，可以在此处开启。（后台脚本是指直接通过chrome API控制浏览器自身的脚本，如获取浏览历史、查看网页cookie等）

**文档：**点击可打开浏览器扩展的文档。 MV3版本扩展将部分文档嵌入到了扩展内部，方便随时查看，包括“后台命令参考”、“更新历史”等。

获取元素选择器：点击后可在网页中选择一个元素，然后自动复制该元素的css选择器。

重置网页浮标位置：将网页浮标恢复到默认位置。

## 脚本限制

1. 因为浏览器本身的限制，在浏览器本身的功能页面中（以chrome://开始或chrome应用商店页面）通常无法工作。

[image]

1. 无痕模式（隐身模式）下默认不可使用。如需使用，请尝试在浏览器扩展设置页面中开启允许选项。

[image]

1. 文件网址下默认不可用。如需使用，请在浏览器扩展设置界面中开启选项。
2. 浏览器有各类安全限制，可能导致：

1. 部分网页交互需要人工操作才能触发，如文件上传、document.execCommand脚本。（部分操作可能在人工点击页面一次之后可以通过脚本触发）
2. 有些脚本在iframe框架中无法正常执行。

1. 消息传递需要转换成文本，可能有部分内容无法正常传输。

## 多浏览器支持

- Quicker可以同时连接不同类型的浏览器程序（根据进程名判断），如同时连接Chrome/Edge/Firefox/Vivaldi等。
- 暂不支持同时运行一个浏览器的多个副本（通过--user-data-dir方式使用多个账号）。

在某个动作中第一次使用“浏览器控制”模块时，Quicker会根据前台窗口进程判断要连接的浏览器，并且在后续的操作步骤中持续连接此浏览器。

如果在第一次运行到“浏览器控制”模块时，前台窗口不是已连接的浏览器，则使用配置中设定的“默认连接的浏览器”。

[image]

也可以通过在动作中添加“设置连接的浏览器”操作（添加到其他浏览器操作步骤之前），设置此动作要连接的浏览器。

[image]

可能还有其他无法正常工作的情况，如有遇到欢迎反馈。

# 通用参数

根据要执行的操作类型不同，参数也会有所变化。

[image]

【操作类型】此步骤的目的。

[image]

【**标签页ID**】指定要操作的标签页，如果留空，则表示操作当前活动标签页。

在连续多个步骤操作同一个标签页时使用（如：前面的步骤打开了新的标签页，后面的步骤操作此标签页）。

【**选择器**】用于指定要操作的网页元素的[CSS选择器](https://www.runoob.com/cssref/css-selectors.html)。

选择器对于操作网页是极其基础和重要的知识，请务必了解：[https://www.runoob.com/cssref/css-selectors.html](https://www.runoob.com/cssref/css-selectors.html) 同一个元素有多个CSS选择器可以表示，选择其中的一种即可。

获取选择器的方式请参考本文[后面的章节](#P83qV)。

如果需要通过xpath的方式指定元素，以`xpath:`开始，如：

```plain
xpath://*[@id="lark-text-editor"]/div/div/div[2]/div[1]/div[2]/div[1]/a[11]
```

如果要选择一类元素，比如所有的链接或图片，就需要手写选择器了。

【修正选择器文本】(1.10.3版本提供)从Chrome中复制的选择器文本，如果含有\字符，需要将其替换成\\才能正常定位。此参数可选：

- 自动：自动判断是否需要将\替换为\\。
- 不修正：不替换\字符。
- 替换\为\\：将\替换为\\。

MV3版本浏览器不再需要此功能。

# 打开网址

打开一个网址，并获得其“标签页id”，以方便后续对此标签页进行其他自动化操作。

如果浏览器未启动，quicker会尝试运行浏览器名称启动浏览器，请确保浏览器程序所在目录已经加入PATH环境变量中。

[image]

【网址】要打开的完整网址。需要带有协议头（http://或https://）。

【窗口ID】使用哪个窗口打开网址。可选值：

- 新窗口；
- 当前窗口；
- 也可以通过指定窗口id，使用之前打开的窗口。

【窗口/标签参数】可选。

- 使用新窗口时，指定chrome.windows.create()方法的参数（除去url属性）。参数请参考Chrome API 文档chrome.windows.create 的 createData参数。示例(所有字段都是可选的)：

```javascript
{
  	"left": 100,
    "top": 100,
    "width": 400,
    "height": 400,
    "incognito": true,
    "type": "popup"
}
```

- 不使用新窗口时，指定chrome.tabs.create()方法的参数（除去url属性），参考文档。

【等待操作完成】等待网页加载完成（标签页前面不转圈了）。资源比较多的网页加载时间会比较长，有的带有长连接的网页，会一直是加载不完成的状态，后续的操作不一定要等待加载完成。

[image]

【超时时间】等待网页加载的时间。

## 输出
【是否成功】操作是否出错。

【标签页ID】新打开的标签页ID号数字。后续如果需要对打开的网页进行操作，需要提供此标签页ID。

【窗口ID】打开新窗口时，输出新打开的窗口的编号。

【原始返回结果】从浏览器插件返回的原始结果反序列化后的[JToken](https://www.newtonsoft.com/json/help/html/T_Newtonsoft_Json_Linq_JToken.htm)对象。JToken可以用来方便的访问Json内容。

**相关后台命令**

对MV3版本扩展，您也可以通过“后台命令”功能创建标签页或窗口。

- api_tabs_create
- api_windows_create
- scripts_createNewWindowWithUrls 创建窗口并打开多个网址

**相关子程序**

- 切换标签或打开网址 如果浏览器中已经打开此网址，则不再打开新的标签页，而是将已有标签页激活。

# 等待加载完成

等待某个标签页的内容加载完成。（标签页的status变为‘**complete**’）

通常用于使用脚本提交了表单等造成页面刷新或表单提交的情况。根据网页资源的多少，加载完成时间可能比较长。

[image]

**参数**

【标签页Id】要操作的标签页编号。如果为空，表示当前活动标签页。

【超时时间】等待网页状态变为加载完成状态。

【失败后停止】超时后是否停止动作。注：不是所有的操作都需要彻底加载完成才能继续。

## 输出
【原始返回结果】空。

# 激活标签页

（需MV3版本扩展）

激活（切换到）Chrome浏览器中的特定标签页，并返回标签页信息。它有两种主要的定位标签页的方式：

1. 通过标签ID（tabId）：如果提供了有效的标签ID，会直接查找并激活该标签页。
2. 通过【网址】查找标签页并激活。可以传入两种值：

- 如果参数值包含通配符（*），如https://*.google.com/foo*bar，表示是一个网址匹配模式，使用Chrome API的URL匹配功能查找。
- 如果不包含通配符，则查找实际网址包含参数值的标签页。
- 如如果未找到，且参数值是一个常规网址，则会自动创建一个标签页打开此网址。

函数执行成功后，会激活找到的标签页（使其成为当前活动标签）并使其所在的窗口获得焦点。

[image]

# 获得标签页信息

获得某个标签页的信息。不指定标签页ID时，获取当前活动标签页的信息和扩展本身的信息。

MV3版本扩展中新增输出Manifest版本，可以用以判断是否为新版本扩展、是否支持运行后台脚本。

[image]

**输入**

【标签页Id】要获取信息的标签页序号。 不填写时表示获取当前活动标签页的信息。

## 输出
【标签页Id】在获取当前活动标签页信息时，得到标签页的Id。

【窗口Id】标签页所在窗口的Id。

【网址】标签页所打开的网址。

【网页标题】网页的标题文字。

【Favicon图标网址】网页图标的网址。

【浏览器】当前连接的浏览器名称，支持chrome/msedge。

【插件版本】浏览器扩展的版本号。

【Manifest版本】返回浏览器扩展的Manifest版本号，值为2或3。

【原始返回结果】当前标签页的[Tab对象信息](https://developer.chrome.com/extensions/tabs#type-Tab)。

# 关闭标签页

关闭指定的标签页。

[image]

**输入**

【标签页Id】要关闭的标签页。未指定标签页Id时，关闭当前活动标签页。

# 对标签页运行脚本

对指定的标签页网页运行js脚本。

📢MV3版本扩展的重要变化：

- 需要在浏览器扩展设置中开启开发者模式或在扩展详情设置中开启“允许运行用户脚本”选项（浏览器138以后的版本）才能使用此功能。
- 新增支持“运行环境”参数。使用MAIN时，可访问网页中的js变量。

[image]

**输入**

【标签页Id】要运行脚本的标签页，未指定时，对当前活动标签页运行脚本。

【脚本内容】要运行的js脚本内容。

- 脚本中可以使用jquery库，如$('#input')。
- 最后一个语句的结果将作为值返回。不要写return关键词。
- 可使用异步方法或返回Promise。代码将会在Promise得到解析后返回。

js脚本的值通常是脚本中最后一个语句的返回值。

如下面的脚本返回网页的文本内容：

```javascript
document.body.innerText;
```

返回复杂对象：

```javascript
//.js
let result = {name: '张三', age: 20};
result;
```

使用异步方法示例：

```javascript
//.js
// 定义一个等待指定毫秒数的函数，返回一个 Promise
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 异步函数，等待 2 秒后返回字符串
async function fetchValue() {
  console.log('开始等待 2 秒…');
  await wait(2000);  // 暂停 2 秒
  return '这是异步返回的值';
}

fetchValue();
```

【从脚本手动返回数据】有的情况运行脚本不能直接得到结果，需要等到回调函数执行/元素更新等情况，这时候可以开启“从脚本手动返回数据”选项，并在脚本中调用sendReplyToQuicker方法手动返回数据。也可以考虑使用上面的异步方法直接返回结果。

```javascript
// 参数中需要启用“从脚本手动返回数据”选项。
// sendReplyToQuicker(是否成功, '失败时提示消息', 数据对象, 回复的消息序号qk_msg_serial宏)

setTimeout(function(){
	sendReplyToQuicker(
    true,
    'ok',
    {'key':'value','name':'zhangsan'},
    qk_msg_serial
  );
}, 1000);
```

注：脚本中的 `qk_msg_serial` 会被自动替换成消息编号数字。

【超时时间】等待返回结果的最长时间（毫秒数）。

【运行脚本的框架】在哪些frame中运行此脚本。`all`表示所有框架。`0`表示主页面框架。其他数字表示对应的框架序号。

注：默认框架为all。有时候运行脚本超时，可能是有一些框架增加了保护，这时候可以尝试将运行脚本的框架改为0，限制在主框架中运行。

【运行环境】可选，默认为`USER_SCRIPT`。指代码执行的上下文，可选值为`USER_SCRIPT`或`MAIN`。值为`MAIN`时，使用网页自身的上下文执行js代码，此时可访问网页中的全局变量信息。

## 输出
【原始返回结果】js脚本的返回值JToken对象。可以输出给文本变量获得原始json。

实际值是一个数组（JAarry类型），表示每个Frame的运行结果。如果网页只有一个Frame，则该数组只有一项。

# 选择元素

从网页中选择一个HTML元素，返回这个元素的css选择器。通常用于在后续步骤中使用此选择器对目标元素执行操作。

[image]

## 输出
【CSS选择器】目标元素的css选择器。

注意：如果网页是变化的，css选择器可能会失效。

# 获取元素信息

获取网页元素的信息。

[image]

**输入**

【标签页ID】要获取信息的标签页，未指定时，获取前活动标签页中的网页元素。

【选择器】用于选择要操作元素的[CSS选择器](https://www.runoob.com/cssref/css-selectors.html)。

【元素信息类型】要获取元素哪方面的信息。

支持的类型有：

- 值：通过jquery的val()方法获取元素的值。主要用于获取input、select和textarea类型元素的值。要获取选中的radio button或 checkbox的值，需要在选择器中使用:checked修饰符，如：

- select#foo option:checked  获得一个下拉框的选中项的值
- select#foo   获得一个下拉框的值
- input[type=checkbox][name=bar]:checked  获得某个选中的检查框的值
- input[type=radio][name=baz]:checked  获得某个选中的单选按钮的值

- 某个Attribute属性：通过jquery的attr()方法获取元素的属性值。attr通常是网页代码里设置的属性值。
- 某个Property属性：通过jquery的prop()方法获取元素的属性值。prop通常是属性运行时的值，如果链接的网址，在href='/index'的情况下，attr得到的是'/index'，prop得到的是根据当前网址计算得到的完整网址。
- innerText：元素节点及其后代（子节点）的“渲染”文本内容。此信息通过jquery的text()方法获取。
- innerHTML：元素内的HTML内容。此信息通过jquery的html()方法获取。
- outerHTML：包含元素自身的HTML内容。此方法通过DOM元素的outerHTML属性获得。

【属性名】当要获取的元素信息类型位“某个Attribute”或“某个Property”时，指定属性名。如链接的网址属性为“href”。

## 输出
【第一个值】获取第一个符合选择器条件的元素的指定信息。一般用于取某一个特定元素的信息。

【所有的值】所有符合选择器条件的元素的值的列表。一般用于取某一类元素的信息。

**示例动作**

- 获取网页里的所有链接地址和图片网址：https://getquicker.net/sharedaction?code=68da9f93-57ee-4465-058e-08d823a26917

# 更新元素信息

更新元素某方面的信息。参数输入请参考“[获取元素信息](#avdHD)”。

更新元素时，所有符合“选择器”条件的元素的对应信息都会被更新。

参考文档：[使用浏览器控制的一些示例](https://getquicker.net/KC/Help/Doc/web-page-control)

示例动作：[用百度特定搜索关键词](https://getquicker.net/Sharedaction?code=9e70fb7f-b85e-4b21-1b7a-08da8ae0e8b9)

[image]

**对于input、textarea等元素**

【元素信息类型】选择“值”，然后在【值】参数中填写目标值即可。

**更新下拉框select元素的值**

首先请确定要设置的选项的值（value）

[image]

然后使用“更新元素信息”操作，元素信息类型为“值”

[image]

**更新选择检查框和单选框的选择状态**

可以通过更新**checked **的属性（Property）选择或取消选择checkbox 或 radio 的选择状态。

[image]

更早的版本，可以使用在对标签页运行js代码：

```javascript
$('选择器').prop('checked', true);  //选择检查框
$('选择器').prop('checked', false);  //取消选择
```

需要使用input元素本身的选择器来更新选中状态。

[image]

# 触发事件

对指定的元素触发事件，如实现点击按钮、设置焦点、提交表单、触发变更等功能。

[image]

**输入**

【标签页ID】要操作的标签页，未指定时表示操作当前活动标签页。

【选择器】要操作的网页元素。

【触发事件类型】要触发的事件。可以选择预置的事件，也可以直接写事件名称。

[image]

或指定自定义的事件类型。

[image]

- 支持以native.前缀表示使用javascript原生dispatchEvent方式触发事件。如native.focus表示.dispatchEvent(new Event('focus') )。
- change事件使用dispatchEvent方式触发。
- click事件直接调用DOM的click()方法 实现。
- 其它事件通过jquery.trigger()方法实现。
- 提交表单时，需要使用form元素本身的选择器。

# 等待网页变化

(MV3版本扩展新增功能）

等待动态网页发生特定的变化，比如某个元素出现或消失、某个文字出现或消失等。

本功能仅适用于不会跳转到新页面的网页（因为新页面会造成嵌入的js代码丢失）。

[image]

【选择器】所需要判断的目标元素。

【事件类型】要等待的事件类型，见下表。

【参数】对于某些事件，需要指定参数。

| 事件名称 | 事件说明 | 参数说明 | 示例参数 |
| --- | --- | --- | --- |
| elementExists | 元素存在 | 不需要参数 | - |
| elementNotExists | 元素不存在 | 不需要参数 | - |
| elementVisible | 元素在网页可见 | 不需要参数 | - |
| elementNotVisible | 元素在网页不可见 | 不需要参数 | - |
| elementClickable | 元素可点击 | 不需要参数 | - |
| elementNotClickable | 元素不可点击 | 不需要参数 | - |
| textContains | 包含文本 | 字符串类型，表示要查找的文本内容 | `登录` |
| textNotContains | 不包含文本 | 字符串类型，表示不应包含的文本内容 | `错误` |
| textMatches | 文本匹配表达式 | 正则表达式字符串 | `用户\d+` |
| textNotMatches | 文本不匹配表达式 | 正则表达式字符串 | `error\s:` |
| urlMatches | 网址匹配表达式(PWA应用) | 正则表达式字符串 | `login\.html` |
| urlNotMatches | 网址不匹配表达式(PWA应用) | 正则表达式字符串 | `error\.html` |
| titleMatches | 标题匹配表达式(PWA应用) | 正则表达式字符串 | `主页\s-` |
| titleNotMatches | 标题不匹配表达式(PWA应用) | 正则表达式字符串 | `加载中` |
| attributeMatches | 属性匹配表达式 | 格式为"属性名:正则表达式" | `data-status:success` |
| attributeNotMatches | 属性不匹配表达式 | 格式为"属性名:正则表达式" | `aria-disabled:true` |
| elementHasClass | 元素包含类名 | 字符串，表示要检查的类名 | `active` |
| elementNotHasClass | 元素不包含类名 | 字符串，表示不应存在的类名 | `disabled` |
| elementHasAttribute | 元素包含属性 | 字符串，表示要检查的属性名 | `checked` |
| elementNotHasAttribute | 元素不包含属性 | 字符串，表示不应存在的属性名 | `disabled` |
| elementCountGt | 元素数量大于 | 数字，表示元素数量的下限 | `5` |
| elementCountLt | 元素数量小于 | 数字，表示元素数量的上限 | `10` |
| elementCountEq | 元素数量等于 | 数字，表示期望的确切元素数量 | `3` |
| elementEvent | 元素事件触发 | 字符串类型，表示要监听的事件名称 | `click` |

【超时时间】最长等待时间。

# 设置连接的浏览器

设置当前动作要控制的浏览器。后续步骤的浏览器控制将会使用此浏览器。

如果总是操作前台窗口浏览器，不需要使用此步骤。

# 运行后台命令

通过调用浏览器API，实现对浏览器自身的控制。

分为两个大类：

- 以api_前缀开始的命令，是对浏览器API的封装。如api_tabs_create对应于chrome.tabs.create()方法。
- 以scripts_前缀开始的命令，是一些预先写好的后台脚本。

后台命令参考：

- 在线文档
- 扩展内置文档：1）点击浏览器扩展图标；2）点击“文档”；3）进入后点击“后台命令参考”链接。

步骤截图：

[image]

**参数**

【命令】要执行的后台命令。

【命令参数】根据需要填写给该命令传入的参数。

- 对于需要tabIdtabIdswindowIdgroupId参数的命令，通常可以省略这些参数，表示当前标签页id、当前标签页所在窗口id、当前标签页所在分组id。

指定参数值的方法：

1）直接传递json文本。

2）使用表达式创建匿名c#对象，如：

```csharp
$= new {
    tabId = {数字变量},
    updateProperties = new {
        mute = true
    }
}
```

【等待操作完成】如果需要返回值，请选择此项。

【返回值过滤器】对于命令返回的数据，如果仅需要其中一部分属性，可以设置本参数。参数值为分号隔开的属性名。如，下面的步骤返回所有打开的网址：

[image]

示例动作：

- 测试后台命令 - by CL - 动作信息 - Quicker

## 使用后台命令实现后台脚本相关功能

后台脚本与后台命令的区别如下：

- 后台脚本可以多次调用浏览器API，实现完整的自定义逻辑。
- 后台命令每次只能调用一个API，可以看做使用了一次await方式调用API，因此可能需要多次调用后台命令实现原有单个后台脚本的功能。

# 运行后台脚本

🚨 MV3版本浏览器扩展已不支持此功能。相关需求请使用“运行后台命令”功能实现。

1.44.10+版本实现了在MV3扩展上执行后台脚本的功能，此功能可继续使用。如果您在使用后台脚本的时候遇到了问题，欢迎在讨论区反馈，谢谢！

## 迁移后台脚本动作

可以在Quicker 1.44.5+版本搜索框搜索“CONTAINS:BackgroundScript”查找使用后台脚本功能的动作。

[image]

如需兼容MV2版本扩展，可通过“获取标签页信息”得到Manifest版本号。 然后判断如果Manifest版本为3，则使用后台命令，否则使用后台脚本。

[image]

示例动作：[查看Cookie - by CL - 动作信息 - Quicker](https://getquicker.net/Sharedaction?code=287ef444-8487-471d-e118-08d82862a3c3)

## 后台脚本的编写

### MV2版本扩展(0.7.4版本，即将不被支持)

使用回调方式调用chrome API，完成对浏览器的控制。具体API，请参考[官方文档](https://developer.chrome.com/docs/extensions/mv2/reference)。

下面的示例用于获取当前标签页中网址的cookie。

```javascript
chrome.tabs.query({ lastFocusedWindow: true, active: true }, function (tabs) {
    if (tabs.length x.url);
    sendReplyToQuicker(true, "ok", urlList, qk_msg_serial)
});
```

返回数据的示例动作：

- 返回当前窗口的所有标签页网址 https://getquicker.net/sharedaction?code=e0e854ea-5d36-4dd9-14fc-08d8255d6cc9
- 返回TopSites（常用网址。需开通topSites权限）：https://getquicker.net/sharedaction?code=a17f1c61-26b5-4013-14ff-08d8255d6cc9

**3）输出返回结果**

在脚本中使用sendReplyToQuicker返回的data参数，如果是object类型，将会直接返回；

如果对象是简单类型（如数字、字符串等），会封装为一个对象返回（MV3版本扩展不再封装，而是直接返回）：

```javascript
{
  "data":qk_bgmsg_result
}
```

输出结果为JToken对象。请参考后面的“从JToken提取数据”章节。

其他后台脚本示例动作：

- 关闭左侧标签页：https://getquicker.net/sharedaction?code=315a8235-e00a-4b89-8236-08d8246a94ad
- 弹出此页：https://getquicker.net/sharedaction?code=bed4a309-2d20-47cb-8238-08d8246a94ad

# 将动作关联到浏览器右键菜单

- 浏览器右键菜单不支持显示图标。
- 本功能使用了chrome.contextMenus API，更多信息可参考谷歌官方文档。

可以将动作关联到浏览器右键菜单中，效果如下图所示：

[image]

**设置方法**

- 编辑动作。
- 在动作的“关联”标签页中，点击“浏览器右键菜单”下面的“设置...”按钮（1）。
- 在弹出的窗口设置各项参数：

- 【关联上下文】设置什么地方的右键菜单出现此项（官方文档），如selection是指在选中的内容上的右键菜单中出现此项，all表示在大部分情况下都出现此此项。
- 【匹配网址】设置匹配的网址条件。*://*/*表示不限制。注意这里的匹配不是正则匹配，具体可参考官方文档。
- 【匹配目标地址】匹配img、video、audio的src，或者链接的href地址。匹配方式同上。
- 【动作参数】需要传递给动作的参数内容。使用%s可以表示浏览器中选择的文本内容。

[image]

设置完成后需重新连接浏览器方可生效。可重启浏览器或Quicker，或在“修复浏览器扩展连接”窗口中点击“更新右键菜单”按钮。

[image]

动作关联到浏览器右键菜单时，通过菜单触发动作，可以在表达式中通过_context.ExtraData.BrowserMenuClickData 获取菜单点击上下文信息。能获取到的数据可参考[chrome API文档](https://developer.chrome.com/docs/extensions/reference/contextMenus/#type-OnClickData)。 使用场景：获取右键点击的图片、视频、链接的网址等。

示例动作：[https://getquicker.net/Sharedaction?code=d1650c2d-f913-4959-3931-08d9f928b257](https://getquicker.net/Sharedaction?code=d1650c2d-f913-4959-3931-08d9f928b257)

# 排错

## 查看日志

### 查看背景页面控制台信息

在浏览器扩展页面中开启“开发者模式”。然后点击扩展的“背景页”

[image]

在背景页的控制台可以看到一些log输出。

[image]

### 查看ChromeAgent日志

ChromeAgent.exe是与浏览器通信的中间件程序，由浏览器启动。ChromeAgent启动后会主动连接Quicker。

为避免更新Quicker软件时文件被锁定，ChromeAgent.exe将会在Quicker安装后首次启动时，由Quicker程序复制到应用数据文件夹下并注册。位置为：`Quicker应用数据文件夹\bin\NativeMessageHost`（一般为：C:\Users\用户名\AppData\Local\Quicker\bin\NativeMessageHost）

log文件的存储位置为`Quicker应用数据文件夹\logs\`，文件名为`quickerhost_浏览器名称.log`

[image]

# 扩展连接问题排查

[image]

如果消息代理未连接，请参考如下顺序排查：

0）请确保浏览器已开启开发者模式。

1）确认您的扩展是从官方商店安装。 如果以crx方式安装，请直接拖动到扩展管理界面中完成安装，不要解压缩。

2）确认Quicker未使用管理员身份方式运行。

- 确认未设置Quicker.exe等相关程序使用兼容模式，未选择以管理员身份运行选项。
- 确认系统UAC为默认状态。

3）确认环境变量ComSpec存在

[image]

4）确认C:\Windows\System32\cmd.exe文件存在，通过Win+R可正常运行cmd.exe命令。

[image]

5）尝试修复扩展连接：

[image]

6）控制台的默认代码页为正常值。（现象：消息代理一会儿可以连上又马上自动断开）

[image]

7）如果有任何安全、管家类软件，彻底退出后测试排查。

[腾讯管家](https://getquicker.net/KC/Kb/Article/1118)的某些版本可能会影响扩展正常链接，卸载管家后测试。（正常后可重新下载安装管家最新版解决。）

8）如果仍然无法连接，请联系CL。

# 其它信息

## 如何获取页面元素的CSS选择器或XPATH

注：同一个元素可以有多种CSS选择器表示方式。

有很多获取CSS选择器的方法：

（1）通过浏览器获取

在网页中安Ctrl+Shift+C开启选择模式(F12关闭)，选择节点后，在开发工具窗格中元素上右键，复制选择器。

[image]

（2）Quicker扩展右键菜单

[image]

（3）第三方浏览器扩展，如ChroPath、SelectorsHub。

## 组件构成

**Quicker**：发送指令并获取返回结果；

**ChromeAgent.exe**：消息代理程序，连接Quicker和浏览器插件。会在Quicker安装或升级版本后首次启动时拷贝到“应用数据文件夹\bin\NativeMessageHost”子文件夹下。

**Chrome浏览器插件**：负责接收指令、执行指令，并返回结果。

## 从JToken中提取信息

注意：

- 对标签页运行脚本，返回的结果是数组，表示每个Frame框架中的运行结果。
- 运行后台脚本返回的是通过qk_bgmsg_result变量设置的object类型的结果或者封装的{data: qk_bgmsg_result}封装的简单值结果。

[JToken](https://www.newtonsoft.com/json/help/html/T_Newtonsoft_Json_Linq_JToken.htm)可以在表达式中使用** [数组的序号] **和** [对象的属性名] **访问到某个值，然后通过.ToString() 方法得到文本。

下图的表达式，得到了返回结果数组第0个对象的title属性的值。

[image]

也可以使用[SelectToken](https://www.newtonsoft.com/json/help/html/SelectToken.htm)获取对象（或SelectTokens获取数组）。

[image]

也可以获取其原始类型的值（根据实际的类型），下面的表达式得到 "val" 属性的整数值：

[image]

## 如何开启浏览器的开发者模式

“对标签页运行脚本”需要开启浏览器开发者模式(浏览器138之前版本)或对扩展开启“允许运行用户脚本”(浏览器138之后的版本)。

开启“允许运行用户脚本”选项的步骤：

1）打开扩展详情页面：在扩展按钮上右键，选择“管理扩展程序”

[image]

2）开启选项

[image]

开启开发者模式请参考如下步骤设置：

1）打开浏览器扩展管理页面。

[image]

2）在右上角，点击打开开发者模式。

[image]

3） 重启Quicker Connector扩展。

[image]

## 参考文档

- HTML教程：https://www.w3school.com.cn/html/index.asp
- CSS选择器：https://www.w3school.com.cn/cssref/css_selectors.asp
- Javascript教程：

- https://www.w3school.com.cn/js/index.asp
- https://www.runoob.com/js/js-tutorial.html
- https://www.liaoxuefeng.com/wiki/1022910821149312

- JQuery教程：

- https://www.runoob.com/jquery/jquery-tutorial.html
- https://www.liaoxuefeng.com/wiki/1022910821149312/1023022609723552

- Chrome开发文档：

- API：https://developer.chrome.com/extensions/api_index
- API文档国内镜像：http://docs.getquicker.cn/chrome/developer.chrome.com/extensions.html

# 更新说明

-
- 20230207 增加无法连接问题排查。
- 20230203 增加切换标签或打开网址的子程序链接。
- 20230316 增加触发事件支持native方式的说明。
- 20231015 去除创建新窗口时的实例参数中active字段（浏览器不支持）。
- 20231203 更新显示在浏览器右键菜单的匹配网址说明。
- 20240529 修正拼写。
- 20250203 完善连接排查中Quicker未使用管理员身份运行的检查说明。
- 202505  更新MV3版本浏览器扩展。

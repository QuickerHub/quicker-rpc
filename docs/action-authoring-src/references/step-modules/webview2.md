# sys:webview2

> **分类**：网络与云服务 · **官方**：[webview2](https://getquicker.net/KC/Help/Doc/webview2)

**用途**：Open/control WebView2 embedded browser window

## 要点（摘自官方文档）

提示：

- 本模块使用了微软WebView2组件。
- 组件安装地址：https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/ （Win11操作系统会自带WebView2）
- 在Quicker动作中修改变量名时，JS脚本中使用的Quicker变量名可能无法自动更改。

操作类型：

- 打开网址：打开一个指定的网址或HTML网页内容，然后继续运行后面的模块。如果指定了“窗口标识”并且之前已经打开了窗口，则使用已打开的窗口打开网址。
- 打开网址并加载完成：打开一个指定的网址，等待加载完成，然后继续运行后面的模块。
- 打开网址并等待窗口关闭：打开指定的网址，等待用户关闭窗口后再继续运行后面的模块。
- 发送消息：使用PostWebMessageAsJson接口向网页发送消息。需要预先在网页中引入处理消息接收的代码。可用于动态更新网页的某些内容。
- 执行脚本：在网页上下文中执行js代码。使用ExecuteScriptAsync接口。仅在顶层文档中执行（不对iframe执行）
- 获取窗口状态：获取当前的网址、标题、是否加载完成等信息。
- 关闭窗口：根据“唯一性标识”关闭之前已打开的窗口。
- 重新加载/刷新：刷新网页。
- 停止加载：停止加载网页。
- 检查是否安装WebView2。
- 【多标签】打开网址：使用多标签页窗口同时打开多个网址。方便打开一组相关的窗口并一起关闭。
- 【多列】打开网址：使用多列布局方式同时打开多个网址。

## 参数

### 操作类型：打开网页

【网址或HTML内容】需要打开的网址或HTML代码。

【附加的浏览器参数】[参考文档](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2environmentoptions.additionalbrowserarguments?view=webview2-dotnet-1.0.2045.28)。 非必要请勿设置此参数，此参数可能造成无法同时开启多个WebView2窗口。

如：设置代理服务器参数，可使用类似于这样的参数： `--proxy-server=http://127.0.0.1:8888`。

【虚拟主机映射】将本地目录映射为一个服务器域名。 如`myserver|d:\folder`，将`d:\folder`映射为一个名为`myserver`的服务器，可以在网页中使用`https://myserver/file.png`这样的网址加载目录中的文件。需确保此目录在电脑上存在。

【UserAgent】必要时用于自定义浏览器UserAgent参数。

可以在[这里查看](https://tools.getquicker.cn/browser/useragent)您当前使用的浏览器的UserAgent。

可以在这里查看最新的其它设备UserAgent：[https://www.whatismybrowser.com/guides/the-latest-user-agent/](https://www.whatismybrowser.com/guides/the-latest-user-agent/)

【窗口标题】

【窗口图标】

【默认背景色】

【窗口标识】可以通过相同的标识避免打开多个窗口。 再次使用模块打开网址时，会自动在已经打开的窗口中更新。`=`表示使用当前动作的ID作为窗口标识（用以避免重复）。

【如果窗口已存在】打开网址时，如果已经打开了具有相同标识的窗口，则进行何种操作。

【js脚本】在网页加载后执行的js脚本内容。将通过 [AddScriptToExecuteOnDocumentCreatedAsync](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.addscripttoexecuteondocumentcreatedasync?view=webview2-dotnet-1.0.2045.28) 方法注入。

【窗口位置】设定显示窗口的位置类型。

【窗口尺寸/位置】当“窗口位置”参数为自定义位置时，可以设定窗口的坐标，格式为`left,top,right,bottom`，可以直接写逻辑像素值或相对于屏幕的百分比数值，如`981,608,2610,1143`、`25%,25%,75%,75%`  。窗口位置为其它类型时，可用于设定窗口尺寸，格式为`width,height`，可以使用逻辑像素值或屏幕百分比数值，如`400,700`、`50%,50%`。

【默认下载文件夹】设定默认下载到的文件夹。 此选项对所有相同Profile下的WebView窗口生效。

【Profile】当需要使用多个账号登录同一网站时，可以创建独立的Profile 来存储单独的一套用户数据。通常使用一个单词或拼音来作为Profile名称。

【置顶显示】略。

【显示任务栏图标】略。

【不占用焦点】略。

【失去焦点自动关闭】略。

【按Esc关闭窗口】略。

【显示工具栏】是否显示工具栏：前进、后退、刷新、地址栏。

【窗口风格】可选普通窗口或无边框窗口。

【关闭窗口时清理cookie】关闭窗口时，清理最后显示网页的cookie数据（用于自动退出网页账号。）

### 操作类型：发送消息

【窗口标识】目标WebViw窗口的标识。

【消息内容】json格式的文本内容，通过 [PostWebMessageAsJson](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.postwebmessageasjson?view=webview2-dotnet-1.0.2045.28) 方法发送到WebView2控件。

在网页中需要有代码接受消息并进行处理。示例：

```javascript
window.chrome.webview.addEventListener('message', event =>
{
	console.log('recv message:', event.data);

	document.getElementById('js_fanyi_input').innerText = event.data.keyword;
	//模拟一个输入，才会真正去翻译。
	document.getElementById('js_fanyi_input').dispatchEvent(new Event('input',{bubbles:true}));

});
```

### 操作类型：执行脚本

【窗口标识】目标WebViw窗口的标识。

【JS脚本】要执行的脚本内容。将通过[ExecuteScriptAsync](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.executescriptasync?view=webview2-dotnet-1.0.2045.28) 方法执行。

## 附加的视图类型

这两个布局窗口主要为了方便同时打开多个相关的网页，没有和动作其它部分进行交互的功能。

两个方式的参数设置也相同。

### 多标签页

使用多标签页窗口同时打开多个网址。

示例场景：使用多个搜索引擎搜索相同关键词。

### 多列

使用多列布局同时打开网站。这种布局因为每列比较窄，比较适合访问移动端网页（通常需要通过设置UserAgent来模拟移动浏览器）。

### 参数设置

【网址列表】定义要打开的网址，每行一个，可以为下列格式之一：

- 网址 直接写网址，此时标签页标题自动使用网页标题。
- 标题|网址 此时使用固定的标题。
- 标题(ProfileName)|网址 谨慎使用。当需要同时使用多个账号登录相同的网站时，可以为每个账号设定单独的Profile，此时每个账号的cookie等数据会保存在对应的Profile中。

【窗口标题】略。

【窗口标识】可以通过相同的标识避免打开多个窗口。 再次使用模块打开网址时，会自动在已经打开的窗口中更新。

【窗口位置】设定显示窗口的位置类型。

【窗口尺寸/位置】当“窗口位置”参数为自定义位置时，可以设定窗口的坐标，格式为`left,top,right,bottom`，可以直接写逻辑像素值或相对于屏幕的百分比数值。

【UserAgent】必要时设定需要模拟的浏览器UserAgent类型。可以在[这里查看](https://tools.getquicker.cn/browser/useragent)您当前使用的浏览器的UserAgent。

【默认下载文件夹】下载文件的默认保存位置。

【置顶显示】是否将窗口置顶显示。

## 桥接对象

桥接对象用于同动作的其它部分交互，如访问动作中的变量、调用子程序等。

可以通过 `window.chrome.webview.hostObjects.v` 对象以异步方式访问桥接对象，或者通过 `window.chrome.webview.hostObjects.sync.v` 以同步方式访问桥接对象。

更多信息可参考微软[官方文档](https://docs.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.addhostobjecttoscript?view=webview2-dotnet-1.0.774.44#Microsoft_Web_WebView2_Core_CoreWebView2_AddHostObjectToScript_System_String_System_Object_)。

自1.23.5 版本起，可以在js中通过 `$quicker` 异步方式访问桥接对象，通过 `$quickerSync` 同步方式访问桥接对象。

## 读写动作变量

Quicker中使用WebView2组件的[AddHostObjectToScript](https://docs.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/0-9-488/icorewebview2#addhostobjecttoscript)接口注入“**v**" （v表示variables，变量）

异步操作方式：

```javascript
async function func(){
  // 注入的对象
  let v = await $quicker;
  // 读取变量
  let varValue = await v.getVar("变量名");
  // 写入变量
  await v.setVar("变量名", newValue);
}
```

同步操作方式：

```javascript
function funcSync(){
  // 读取变量
  let varValue = $quickerSync.getVar("text");
  // 写入变量
  $quickerSync.setVar("text", "Hello world from js code");
}
```

示例动作：

- https://getquicker.net/sharedaction?code=c501debe-7e80-408c-d791-08d856359351

读写变量操作支持简单变量（数字/文本以及列表变量）。

词典变量在读取时自动转换为json文本数据。词典变量不支持通过setVar方法写入。

## 词典变量的操作

在js中无法直接操作词典变量。

为词典变量赋予一个完整的新值

```javascript
//setDictByJson(变量名, json内容)
$quickerSync.setDictByJson("dict", "{a: 1, b: 2}");
```

为词典的某个key赋值：

```javascript
//setDictItemValue(词典变量名,键名,值)
$quickerSync.setDictItemValue("dict", "c", 3);
```

获取词典的某个键的值：

```javascript
// 返回词典的某个键的值getDictItemValue(词典变量名,键名)
var value = $quickerSync.getDictItemValue("dict","c");
```

## 调用子程序并返回结果

*需****1.23.15+****版本。*

通过 `await $quickerSp(spName, dataObj)` 方法调用动作中定义的子程序。

参数：

- spName: 子程序名称
- dataObj: 子程序输入参数对象。每个key对应于子程序中作为输入参数的变量名。

注意：传入子程序的输入参数dataObj，和回调的输出参数outputObj都是**对象类型**。

示例：

```javascript
// 调用子程序：返回原始输入值
async function testSubprogram(){
  //子程序输入参数，每个key对应子程序的输入变量。 input为子程序的一个输入变量。
  var obj = {input:'Hello Quicker!', age:3};
  // 调用子程序
  var data = await $quickerSp('subprogram1', obj);
  //处理子程序返回结果
  alert('success: ' + data.output); //output为子程序的一个输出变量
}

…

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`


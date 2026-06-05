# sys:mathocr

> **分类**：图片 · **官方**：[mathocr](https://getquicker.net/KC/Help/Doc/mathocr)

**用途**：Recognize math formulas from images

## 要点（摘自官方文档）

调用Mathpix接口识别图片中的公式。

本功能耗费Q豆，费用：每次调用**0.015**豆(价格可能会随汇率等因素波动)。[什么是Q豆？](https://getquicker.net/KC/Kb/Article/933)

注：Mathpix自2022年9月1日起大幅提升了前1000次的API[请求费用](https://mathpix.com/pricing)（从免费提高到0.02美元/每请求），外加美元升值，目前前1000次的每次成本约0.15元，之后每次成本约0.03元。考虑到此功能用户主要为学生朋友，CL在能力范围之内进行补贴，保持每次请求价格0.028Q豆不变。

Mathpix 目前降低了识别价格，从2026年3月21日起，每次识别价格从0.028Q豆下调为0.015Q豆（即约1.5分钱）。

支持两种操作类型：

（1）图片识别：根据给定的图片识别公式。

（2）手写并识别：显示手写板，书写公式后识别内容。

通常用于截图后识别。

参数：

【公式图片】指定要识别的图片。可以为图片变变量（如截图后生成的图片）、图片文件路径或图片网址。

图片文件路径和图片网址需要通过表达式方式传入。

## 输出

【是否成功】操作是否成功。

【Mathpix MD】Mathpix Markdown文本。

【Latex】Latex识别结果。

【MathML】MathML识别结果。

【AsciiMath】AsciiMath识别结果。

【Latex附加格式1】在Latex两侧增加$$符号。

【Latex附加格式2】在Latex两侧增加\begin{equation}与\end{equation}

【原始响应】Mathpix服务器返回的原始内容。

先显示手写板窗口，确认后识别手势数据。

输出参数同图片识别（有的参数会输出空内容，具体以实际输出为准）。

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`

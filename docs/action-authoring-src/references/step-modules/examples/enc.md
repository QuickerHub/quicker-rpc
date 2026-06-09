# sys:enc

> **来源**：step JSON 示例 · **官方**：[enc](https://getquicker.net/KC/Help/Doc/enc)

**用途**：对称/非对称加解密、哈希、HMAC。

## 示例

### SHA256 哈希

```json
{
  "stepRunnerKey": "sys:enc",
  "inputParams": {
    "operation": "hash",
    "hashType": "SHA256",
    "inputContentType": "文本",
    "input.var": "原文"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultHex": "十六进制"
  }
}
```

### AES 加密

```json
{
  "stepRunnerKey": "sys:enc",
  "inputParams": {
    "operation": "enc_aes",
    "inputContentType": "文本",
    "input.var": "明文",
    "keyContentType": "文本",
    "key": "0123456789abcdef",
    "ivContentType": "文本",
    "iv": "0123456789abcdef"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultBase64": "密文"
  }
}
```

### HMAC-SHA256

```json
{
  "stepRunnerKey": "sys:enc",
  "inputParams": {
    "operation": "hash_hmac",
    "hmacAlgorithm": "HMACSHA256",
    "inputContentType": "文本",
    "input.var": "签名原文",
    "keyContentType": "文本",
    "key.var": "密钥"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultHex": "签名"
  }
}
```

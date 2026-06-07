# {{#topic-title}}



**When**: **sys:form** step in data.json. Long form JSON → **formDef.file** → **files/*.form.json** (`qkrpc.form.v1`). NO large inline formDef in data.json.



## Step shape (default)



```json

{

  "stepRunnerKey": "sys:form",

  "inputParams": {

    "operation": "variables",

    "title": "Form title",

    "formDef.file": "files/login.form.json"

  }

}

```



Step-level title/operation/dictVar override spec fields.



### formDef / dynamicFormForDictDef



Wire: `paramKey` / `paramKey.file` / `paramKey.var` — **almost always formDef.file**.



| shape | use |

|-------|-----|

| `"formDef.file": "files/….form.json"` | **default** |

| inline qkrpc.form.v1 in `formDef` | tiny forms only |

| compiled native JSON | export artifact — convert to formDef.file |

| legacy formSpec | compat only; new work: formDef.file |



On Quicker save: compile to native formDef.value in memory; **disk keeps formDef.file**. Pull from Quicker may decompile to .form.json.



## qkrpc.form.v1



```json

{

  "$schema": "qkrpc.form.v1",

  "mode": "variables",

  "title": "…",

  "dictVar": "data",

  "fields": [ { "key": "userName", "label": "…", "type": "text", "target": "userName", "required": true } ],

  "options": { "help": "…", "windowWidth": 520 }

}

```



| field | notes |

|-------|-------|

| mode | variables \| dict_dynamic |

| dictVar | required for dict_dynamic |

| fields[] | ≥1; key `^[A-Za-z_][A-Za-z0-9_]{0,63}$` |

| type | text, textarea, number, integer, boolean, select, dateTime, password |

| visibleWhen | `{ field, eq }` or `{ field, ne }` |



Compiled native uses PascalCase FormField names (FieldKey, Label, InputMethod, SelectionItems).



## Related



action-steps · action-project-files · step-runner-get · overview


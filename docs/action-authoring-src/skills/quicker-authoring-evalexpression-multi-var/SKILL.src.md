
# evalexpression 多变量赋值

Load when benchmark or user asks for **one evalexpression step** setting multiple action variables.

## Working pattern (number variables)

```text
{a} = Convert.ToDouble(1);
{b} = Convert.ToDouble(2);
{c} = {a} + {b}
```

Then `sys:showText` with `text.varKey = c`.

## Trap

| write | result |
|-------|--------|
| `{a} = 1` with `varType: number` | 「指定的转换无效」 |
| `{a} = Convert.ToDouble(1)` | OK |

RHS from other vars (`{c} = {a} + {b}`) is fine once `a`,`b` are set.

## Verified

- retro: `docs/authoring-references/benchmarks/retro/2026-06-13-sdk-l2-batch.md`
- trace: `b63593ce-d494-40f9-a87e-18011c443d28`

Deep-read: **quicker-eval-expression** → `expressions` topic.

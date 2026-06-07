# {{#topic-title}}

**When**: authoring **sys:form** — need machine-readable `files/*.form.json` (qkrpc.form.v1) + step wire.

## JSON schema

`qkrpc guide get --topic form-spec-schema --json` → **`schema`** (`qkrpc.form-spec.v1`).

`qkrpc form validate --json` / `form build --json` → **`formSchema`** + **`formTemplate`**.

Disk document uses `"$schema": "qkrpc.form.v1"` inside each `files/*.form.json`.

Human prose: **form-spec** · **action-steps** · **action-project-files**.

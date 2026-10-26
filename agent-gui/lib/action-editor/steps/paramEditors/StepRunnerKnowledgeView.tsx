import type { StepRunnerUiKnowledge } from "../../api/stepRunnerKnowledge";

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "未知";
}

/** A read receipt belongs to the current schema owner, independently of retained editing fields. */
export function StepRunnerKnowledgeView({ observation, current, loading, error }: {
  observation?: StepRunnerUiKnowledge;
  current: boolean;
  loading: boolean;
  error?: string;
}) {
  const knowledge = current ? observation?.knowledge : undefined;
  const source = record(knowledge?.source), schema = record(knowledge?.schema);
  const verified = current && observation?.knowledgeState.status === "available";
  const label = error ? "当前读取失败" : !current ? (loading ? "读取中" : "未取得当前定义")
    : verified && source?.kind === "runtime-definition" ? "原生运行时"
    : verified && source?.kind === "bundled-adapter" ? "内置适配" : "来源未知";
  return <section className="step-editor-knowledge" aria-label="参数定义来源">
    <details>
      <summary><span>参数定义来源</span><strong>{label}</strong></summary>
      <div className="step-editor-knowledge-detail">
        {current ? <>
          {!verified ? <p>{observation?.knowledgeState.reason || "本次参数定义没有已核验的来源信息。"}</p> : null}
          <dl>
            <div><dt>宿主</dt><dd>{text(source?.hostKind)} · {text(source?.quickerVersion)}</dd></div>
            <div><dt>实例 / 会话</dt><dd>{text(source?.hostInstanceId)}<br />{text(source?.hostSessionId)}</dd></div>
            <div><dt>适配器</dt><dd>{text(source?.adapterAssembly)} · {text(source?.adapterVersion)}</dd></div>
            <div><dt>定义格式</dt><dd>{text(schema?.format)}</dd></div>
            <div><dt>内容指纹</dt><dd>{text(schema?.revision)}</dd></div>
            <div><dt>读取时间</dt><dd>{text(knowledge?.retrievedAt)}</dd></div>
          </dl>
          <p>来源记录仅描述本次读取，不授予输入修改或宿主写入权限。</p>
          {knowledge ? <details className="step-editor-knowledge-raw"><summary>原始来源记录</summary><pre>{JSON.stringify(knowledge, null, 2)}</pre></details> : null}
        </> : <p>{error || "正在核验本次参数定义，保留的编辑内容不代表当前来源。"}</p>}
      </div>
    </details>
  </section>;
}

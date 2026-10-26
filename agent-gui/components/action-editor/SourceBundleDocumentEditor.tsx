"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createSourceBundleDocumentClient, type SourceBundleClientState, type SourceBundleDocumentClient } from "@/lib/source-bundle-document-client";
import { ActionProjectDataEditor, type ActionProjectDataEditorProps } from "./ActionProjectDataEditor";
import { FileEditorCard } from "@/components/chat/FileEditorCard";

export type SourceBundleEditorStorage = { client: SourceBundleDocumentClient; state: SourceBundleClientState };

/** The lease belongs to the mounted file instance; active Chat/presentation changes never release it. */
export function SourceBundleDocumentEditor(props: ActionProjectDataEditorProps) {
  const ownerKey = useId();
  const [storage, setStorage] = useState<SourceBundleEditorStorage>();
  const initialBody = useRef<{ client: SourceBundleDocumentClient; content: string } | undefined>(undefined);
  useEffect(() => {
    let mounted = true;
    const client = createSourceBundleDocumentClient({ cwd: props.cwd, path: props.path, ownerKey,
      onChange(state) { if (mounted) setStorage({ client, state }); } });
    setStorage({ client, state: client.getState() });
    void client.connect();
    return () => { mounted = false; client.close(); };
  }, [props.cwd, props.path, ownerKey]);
  const document = storage?.state.document;
  if (!storage || !document) return <div className="action-project-data-editor">
    <p className={`workspace-explorer-hint${storage?.state.error ? " workspace-explorer-hint--err" : ""}`} role="status">
      {storage?.state.error ?? "正在读取源码包与实际 codec…"}
    </p>
    {storage?.state.error ? <FileEditorCard path={props.path} content={props.content} showHeader={false} fillAvailable /> : null}
  </div>;
  if (initialBody.current?.client !== storage.client) initialBody.current = { client: storage.client, content: document.editorJson };
  return <ActionProjectDataEditor {...props} content={initialBody.current.content} truncated={false} sourceStorage={storage} />;
}

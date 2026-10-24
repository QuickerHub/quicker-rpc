/** Shared model guidance for the existing live-document client tool and turn runtime. */
export function describeLiveProgramDocumentOperations(mode: "read" | "edit"): string {
  return "read_live returns the actual revision, complete native JSON and step references, including unsaved document changes. "
    + "Add stepSchemaFor for a pinned step to read its bound native input contract and exact editableInputKeys. "
    + (mode === "read" ? "This turn is read-only. Do not change the document. "
      : "edit_live changes one pinned step's note after read_live. edit_step_inputs_live changes existing editable input values only after read_live with stepSchemaFor for that same step. "
        + "Pass that actual read tool call ID as readOperationId and its revision. Existing definitions and bindings are preserved, and closed options are enforced. "
        + "This does not execute a module or prove that text values can be converted to runtime types. Dynamic values, bindings and control fields are unsupported by this input operation. "
        + "Changes share the human editor's undo history and remain unsaved. ")
    + "Unconfirmed editor dialogs return LIVE_DOCUMENT_BUSY; do not confirm or discard human drafts automatically. "
    + "No disk or Quicker write, export, save, sync or file editing is available through this tool. "
    + "On an unavailable target or conflict, retain the failure and read again only when the original target is valid; never fall back to another project or disk tools.";
}

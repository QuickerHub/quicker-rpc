/** Public document storage entry point; legacy JSON keeps its existing CAS and shared owner. */
export {
  readProgramDocumentTarget,
  saveProgramDocument,
  withProgramDocumentWriteOwner,
  type ProgramDocumentSaveDependencies,
} from "./legacy-program-document-storage.server";

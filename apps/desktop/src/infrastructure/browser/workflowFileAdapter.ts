import {
  downloadFluxWorkflow,
  parseFluxWorkflowFile,
} from "../../lib/workflowFile.js";
import type { WorkflowFilePort } from "../../features/workspace/application/workflowFilePort.js";

export const browserWorkflowFileAdapter: WorkflowFilePort = {
  parse: parseFluxWorkflowFile,
  download: downloadFluxWorkflow,
};

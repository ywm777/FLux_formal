import { cloudWorkflowApi } from "../../lib/api.js";
import type { CloudWorkflowSharingPort } from "../../features/sharing/application/cloudWorkflowSharingPort.js";

export const cloudWorkflowSharingAdapter: CloudWorkflowSharingPort = {
  getShare: cloudWorkflowApi.getShare,
  createWorkflow: cloudWorkflowApi.create,
  enableShare: cloudWorkflowApi.enableShare,
  getShared: cloudWorkflowApi.getShared,
  copyShared: cloudWorkflowApi.copyShared,
  async disableShare(workflowId) {
    await cloudWorkflowApi.disableShare(workflowId);
  },
};

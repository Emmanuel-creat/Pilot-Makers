/** Types de tâches que la file sait exécuter. */

import { MAIL_RETRY_JOB, retryMailJob } from "./mail";
import type { JobHandler } from "./task-queue";

export const JOB_HANDLERS: Record<string, JobHandler> = {
  [MAIL_RETRY_JOB]: retryMailJob,
};

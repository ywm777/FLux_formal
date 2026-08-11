import {
  Logger,
  ServiceUnavailableException,
  type OnModuleDestroy,
} from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { ExecutionProcessor, type ExecutionJob } from "./execution-processor.service";

/** 执行队列抽象：入队一个执行任务 */
export abstract class ExecutionQueue {
  abstract add(job: ExecutionJob): Promise<void>;
}

function executionJobKey(job: ExecutionJob): string {
  const raw = job.approval
    ? `${job.executionId}-approval-${job.approval.nodeId}`
    : job.resumeId
      ? `${job.executionId}-resume-${job.resumeId}`
      : `${job.executionId}-start`;
  return raw.replaceAll(":", "_");
}

interface JobProcessor {
  process(job: ExecutionJob): Promise<void>;
}

export function readExecutionQueueInteger(
  rawValue: string | undefined,
  fallback: number,
  name: string,
  maximum: number,
): number {
  const value = rawValue?.trim() ? Number(rawValue) : fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} 必须是 1-${maximum} 之间的整数`);
  }
  return value;
}

/** 内存队列：有界、限并发的进程内异步处理（无 Redis 环境使用） */
export class InMemoryExecutionQueue extends ExecutionQueue {
  private readonly logger = new Logger(InMemoryExecutionQueue.name);
  private readonly pending: ExecutionJob[] = [];
  private readonly accepted = new Set<string>();
  private readonly concurrency: number;
  private readonly capacity: number;
  private active = 0;

  constructor(
    private readonly processor: JobProcessor,
    options: { concurrency?: number; capacity?: number } = {},
  ) {
    super();
    this.concurrency = options.concurrency ?? readExecutionQueueInteger(
      process.env.EXEC_CONCURRENCY,
      4,
      "EXEC_CONCURRENCY",
      64,
    );
    this.capacity = options.capacity ?? readExecutionQueueInteger(
      process.env.EXEC_QUEUE_CAPACITY,
      200,
      "EXEC_QUEUE_CAPACITY",
      10_000,
    );
  }

  async add(job: ExecutionJob): Promise<void> {
    const key = executionJobKey(job);
    if (this.accepted.has(key)) return;
    if (this.active + this.pending.length >= this.capacity) {
      throw new ServiceUnavailableException(
        "执行队列已满，请稍后重试",
      );
    }
    this.accepted.add(key);
    this.pending.push(job);
    this.drain();
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) return;
      const key = executionJobKey(job);
      this.active += 1;
      setImmediate(() => {
        void Promise.resolve()
          .then(() => this.processor.process(job))
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`执行任务 ${job.executionId} 未被处理器收口：${message}`);
          })
          .finally(() => {
            this.active -= 1;
            this.accepted.delete(key);
            this.drain();
          });
      });
    }
  }
}

const QUEUE_NAME = "flux-executions";

/** BullMQ + Redis 队列：支持重试、并发控制、跨进程（配置 REDIS_URL 时启用） */
export class BullExecutionQueue extends ExecutionQueue implements OnModuleDestroy {
  private readonly logger = new Logger(BullExecutionQueue.name);
  private readonly connection: ConnectionOptions;
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(redisUrl: string, processor: ExecutionProcessor) {
    super();
    this.connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        await processor.process(job.data as ExecutionJob);
      },
      {
        connection: this.connection,
        concurrency: readExecutionQueueInteger(
          process.env.EXEC_CONCURRENCY,
          4,
          "EXEC_CONCURRENCY",
          64,
        ),
      },
    );
    this.worker.on("failed", (job, err) => {
      this.logger.error(`执行任务 ${job?.id} 失败：${err.message}`);
    });
    this.worker.on("error", (error) => {
      this.logger.error(`执行 worker 异常：${error.message}`);
    });
    this.queue.on("error", (error) => {
      this.logger.error(`执行队列异常：${error.message}`);
    });
  }

  async add(job: ExecutionJob): Promise<void> {
    await this.queue.add("run", job, {
      jobId: executionJobKey(job),
      attempts: readExecutionQueueInteger(
        process.env.EXEC_ATTEMPTS,
        1,
        "EXEC_ATTEMPTS",
        10,
      ),
      removeOnComplete: 200,
      removeOnFail: 200,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
  }
}

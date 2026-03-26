import { Queue, type ConnectionOptions } from "bullmq";

const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const scanQueue = new Queue("scan-processing", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export const fixQueue = new Queue("fix-application", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  },
});

export { connection };

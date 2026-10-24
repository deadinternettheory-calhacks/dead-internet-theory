import { cronJobs, anyApi } from "convex/server";
const crons = cronJobs();
crons.interval(
  "delete expired records",
  { minutes: 1 },
  anyApi.retention.sweep,
  {},
);
crons.interval(
  "backfill retention deadlines",
  { minutes: 10 },
  anyApi.retention.backfill,
  {},
);
crons.interval(
  "delete expired provider artifacts",
  { minutes: 1 },
  anyApi.providerRetention.sweep,
  {},
);
export default crons;

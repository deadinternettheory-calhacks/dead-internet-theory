import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';
const crons = cronJobs();
crons.interval('delete expired inference state', { minutes: 1 }, internal.retention.sweep, {});
export default crons;

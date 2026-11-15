import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("presence cleanup", { minutes: 5 }, internal.presence.cleanup, {});
crons.interval("heartbeat stat", { minutes: 1 }, internal.system.tick, {});

export default crons;

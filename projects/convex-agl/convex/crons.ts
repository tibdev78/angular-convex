import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("presence cleanup", { minutes: 5 }, internal.presence.cleanup, {});
crons.interval("heartbeat stat", { minutes: 1 }, internal.system.tick, {});

// The other schedule kinds, each counted in `stats` (see lab.cronRan).
crons.cron("lab cron expression", "*/2 * * * *", internal.lab.cronRan, { name: "cron" });
crons.hourly("lab hourly", { minuteUTC: 7 }, internal.lab.cronRan, { name: "hourly" });
crons.daily("lab daily", { hourUTC: 3, minuteUTC: 0 }, internal.lab.cronRan, { name: "daily" });
crons.weekly("lab weekly", { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 0 }, internal.lab.cronRan, { name: "weekly" });
crons.monthly("lab monthly", { day: 1, hourUTC: 3, minuteUTC: 0 }, internal.lab.cronRan, { name: "monthly" });

export default crons;

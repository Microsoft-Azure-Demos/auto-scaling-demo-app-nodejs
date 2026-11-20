
const { Worker } = require("worker_threads");
const path = require("path");
const express = require("express");
const os = require("os");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Store active CPU workers and the automatic stress-test timer.
let cpuWorkers = [];
let stressTimeout = null;

// Store previous container CPU measurements for calculating utilization.
let previousContainerCpuUsage = null;
let previousContainerCpuTime = null;

// Store previous VM CPU measurements for calculating utilization.
let previousVmCpuStats = null;

app.use(express.json());
app.use(express.static("public"));

// Return the number of CPUs available to this Node.js process.
// This is more accurate than os.cpus().length in restricted containers.
function getAvailableCpuCores() {
  return typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
}

// Read a Linux cgroup file. Return null if it cannot be accessed.
function readCgroupFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error) {
    return null;
  }
}

// Read cumulative CPU usage from the VM's operating system.
function getVmCpuStats() {
  const cpus = os.cpus();

  let total = 0;
  let idle = 0;

  // Add CPU time across all logical processors.
  cpus.forEach(cpu => {
    Object.values(cpu.times).forEach(time => {
      total += time;
    });

    idle += cpu.times.idle;
  });

  return { total, idle };
}

// Collect VM-level CPU and memory metrics.
function getVmMetrics() {
  const currentCpuStats = getVmCpuStats();

  let cpuUsage = null;

  // Calculate CPU utilization using the difference between two samples.
  if (previousVmCpuStats !== null) {
    const totalDifference =
      currentCpuStats.total - previousVmCpuStats.total;

    const idleDifference =
      currentCpuStats.idle - previousVmCpuStats.idle;

    if (totalDifference > 0) {
      cpuUsage = Number(
        (
          (1 - idleDifference / totalDifference) * 100
        ).toFixed(1)
      );

      // Keep the percentage within the valid range.
      cpuUsage = Math.min(100, Math.max(0, cpuUsage));
    }
  }

  // Save the current CPU sample for the next request.
  previousVmCpuStats = currentCpuStats;

  // Collect memory information reported by the operating system.
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    cpuUsage,
    cpuCores: os.cpus().length,
    memoryUsage: Number((usedMemory / 1024 / 1024).toFixed(1)),
    memoryTotal: Number((totalMemory / 1024 / 1024).toFixed(1)),
    memoryUsagePercent: Number(
      ((usedMemory / totalMemory) * 100).toFixed(1)
    )
  };
}

// Collect container-level CPU and memory metrics from cgroups.
function getContainerMetrics() {
  const metrics = {
    cpuUsage: null,
    cpuCapacityCores: null,
    cpuLimit: null,
    memoryUsage: null,
    memoryLimit: null,
    memoryUsagePercent: null
  };

  const availableCores = getAvailableCpuCores();

  // Read cgroup v2 CPU statistics and CPU quota.
  const cpuStatV2 = readCgroupFile("/sys/fs/cgroup/cpu.stat");
  const cpuMaxV2 = readCgroupFile("/sys/fs/cgroup/cpu.max");

  let currentCpuUsage = null;
  let cpuUsageUnit = null;
  let cpuCapacity = availableCores;

  if (cpuStatV2 && cpuMaxV2) {
    // Extract cumulative CPU usage in microseconds.
    const usageMatch = cpuStatV2.match(/usage_usec\s+(\d+)/);

    if (usageMatch) {
      currentCpuUsage = Number(usageMatch[1]);
      cpuUsageUnit = "microseconds";
    }

    // Determine whether the container has a fixed CPU quota.
    const [quota, period] = cpuMaxV2.split(/\s+/);

    if (quota !== "max" && Number(period) > 0) {
      cpuCapacity = Number(quota) / Number(period);
      metrics.cpuLimit = Number(cpuCapacity.toFixed(2));
    }
  } else {
    // Fall back to cgroup v1 CPU accounting.
    const cpuUsageV1 = readCgroupFile(
      "/sys/fs/cgroup/cpuacct/cpuacct.usage"
    );

    const cpuQuotaV1 = readCgroupFile(
      "/sys/fs/cgroup/cpu/cpu.cfs_quota_us"
    );

    const cpuPeriodV1 = readCgroupFile(
      "/sys/fs/cgroup/cpu/cpu.cfs_period_us"
    );

    if (cpuUsageV1 !== null) {
      // cgroup v1 reports CPU usage in nanoseconds.
      currentCpuUsage = Number(cpuUsageV1);
      cpuUsageUnit = "nanoseconds";
    }

    // A positive quota indicates a fixed CPU capacity.
    if (
      cpuQuotaV1 !== null &&
      cpuPeriodV1 !== null &&
      Number(cpuQuotaV1) > 0 &&
      Number(cpuPeriodV1) > 0
    ) {
      cpuCapacity = Number(cpuQuotaV1) / Number(cpuPeriodV1);
      metrics.cpuLimit = Number(cpuCapacity.toFixed(2));
    }
  }

  // Report the CPU capacity used as the percentage reference.
  metrics.cpuCapacityCores = Number(cpuCapacity.toFixed(2));

  // Calculate CPU utilization between consecutive measurements.
  if (currentCpuUsage !== null && previousContainerCpuUsage !== null) {
    const currentTime = Date.now();

    const usageDifference =
      currentCpuUsage - previousContainerCpuUsage;

    const timeDifference =
      currentTime - previousContainerCpuTime;

    if (timeDifference > 0 && cpuCapacity > 0) {
      // Convert CPU usage to microseconds regardless of cgroup version.
      const usageDifferenceMicroseconds =
        cpuUsageUnit === "nanoseconds"
          ? usageDifference / 1000
          : usageDifference;

      // Calculate utilization relative to the available CPU capacity.
      const percentage =
        (usageDifferenceMicroseconds /
          (timeDifference * 1000 * cpuCapacity)) * 100;

      metrics.cpuUsage = Number(
        Math.min(100, Math.max(0, percentage)).toFixed(1)
      );
    }
  }

  // Save the current CPU measurement for the next request.
  if (currentCpuUsage !== null) {
    previousContainerCpuUsage = currentCpuUsage;
    previousContainerCpuTime = Date.now();
  }

  // Read cgroup v2 memory usage and memory limit.
  const memoryCurrentV2 = readCgroupFile(
    "/sys/fs/cgroup/memory.current"
  );

  const memoryMaxV2 = readCgroupFile(
    "/sys/fs/cgroup/memory.max"
  );

  if (memoryCurrentV2 !== null && memoryMaxV2 !== null) {
    const usedBytes = Number(memoryCurrentV2);

    // Report memory consumption even when no memory limit exists.
    metrics.memoryUsage = Number(
      (usedBytes / 1024 / 1024).toFixed(1)
    );

    // Calculate a percentage only when a finite memory limit exists.
    if (memoryMaxV2 !== "max") {
      const limitBytes = Number(memoryMaxV2);

      if (limitBytes > 0) {
        metrics.memoryLimit = Number(
          (limitBytes / 1024 / 1024).toFixed(1)
        );

        metrics.memoryUsagePercent = Number(
          ((usedBytes / limitBytes) * 100).toFixed(1)
        );
      }
    }
  } else {
    // Fall back to cgroup v1 memory statistics.
    const memoryCurrentV1 = readCgroupFile(
      "/sys/fs/cgroup/memory/memory.usage_in_bytes"
    );

    const memoryLimitV1 = readCgroupFile(
      "/sys/fs/cgroup/memory/memory.limit_in_bytes"
    );

    if (memoryCurrentV1 !== null && memoryLimitV1 !== null) {
      const usedBytes = Number(memoryCurrentV1);
      const limitBytes = Number(memoryLimitV1);

      metrics.memoryUsage = Number(
        (usedBytes / 1024 / 1024).toFixed(1)
      );

      // Ignore effectively unlimited cgroup v1 memory limits.
      if (limitBytes > 0 && limitBytes < os.totalmem()) {
        metrics.memoryLimit = Number(
          (limitBytes / 1024 / 1024).toFixed(1)
        );

        metrics.memoryUsagePercent = Number(
          ((usedBytes / limitBytes) * 100).toFixed(1)
        );
      }
    }
  }

  return metrics;
}

// Application health endpoint.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString()
  });
});

// Return information about the current application instance.
app.get("/api/instance", (req, res) => {
  const interfaces = os.networkInterfaces();

  // Collect non-internal IPv4 addresses.
  const privateIPs = Object.values(interfaces)
    .flat()
    .filter(info =>
      info &&
      info.family === "IPv4" &&
      !info.internal
    )
    .map(info => info.address);

  res.json({
    hostname: os.hostname(),
    operatingSystem: os.platform(),
    architecture: os.arch(),
    uptime: os.uptime(),
    cpuCores: getAvailableCpuCores(),
    privateIPs
  });
});

// Return both container-level and VM-level metrics.
app.get("/api/metrics", (req, res) => {
  res.json({
    container: getContainerMetrics(),
    vm: getVmMetrics()
  });
});

// Helper function to stop all running CPU workers.
function stopCpuWorkers() {
  // Clear the automatic stop timer.
  clearTimeout(stressTimeout);
  stressTimeout = null;

  // Keep a reference to the running workers before resetting the array.
  const workers = cpuWorkers;
  cpuWorkers = [];

  // Terminate all active CPU workers.
  workers.forEach(worker => worker.terminate());
}

// Start the CPU stress test.
app.post("/api/stress/start", (req, res) => {
  // Prevent multiple stress tests from running simultaneously.
  if (cpuWorkers.length > 0) {
    return res.status(409).json({
      message: "CPU stress test is already running."
    });
  }

  // Use the CPU capacity available to this Node.js process.
  const cpuCores = getAvailableCpuCores();

  // Start one CPU worker for each available logical CPU.
  cpuWorkers = Array.from({ length: cpuCores }, () =>
    new Worker(path.join(__dirname, "workers", "cpu-worker.js"))
  );

  // Log errors reported by individual CPU workers.
  cpuWorkers.forEach(worker => {
    worker.on("error", error => {
      console.error("CPU worker error:", error);
    });
  });

  // Automatically stop the stress test after 60 seconds.
  stressTimeout = setTimeout(() => {
    stopCpuWorkers();
  }, 60000);

  res.json({
    message: "CPU stress test started.",
    workers: cpuWorkers.length,
    maximumDurationSeconds: 60
  });
});

// Stop the CPU stress test.
app.post("/api/stress/stop", (req, res) => {
  // Check whether any workers are running.
  if (cpuWorkers.length === 0) {
    return res.status(400).json({
      message: "No CPU stress test is running."
    });
  }

  stopCpuWorkers();

  res.status(200).json({
    message: "CPU stress test stopped."
  });
});

// Return the current CPU stress-test status.
app.get("/api/stress/status", (req, res) => {
  res.json({
    running: cpuWorkers.length > 0,
    activeWorkers: cpuWorkers.length
  });
});

// Start the Express application on all network interfaces.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Auto Scaling Demo App running on port ${PORT}`);
});

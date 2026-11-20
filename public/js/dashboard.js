
// Retrieve information about the application instance.
async function loadInstanceInfo() {
    try {
        const response = await fetch("/api/instance");

        if (!response.ok) {
            throw new Error("Could not retrieve instance information");
        }

        const data = await response.json();

        // Populate the instance information section.
        document.getElementById("hostname").textContent = data.hostname;
        document.getElementById("os").textContent = data.operatingSystem;
        document.getElementById("architecture").textContent = data.architecture;
        document.getElementById("cpu-cores").textContent = data.cpuCores;
        document.getElementById("private-ips").textContent =
            data.privateIPs.join(", ");

        // Convert uptime from seconds into hours and minutes.
        const uptimeHours = Math.floor(data.uptime / 3600);
        const uptimeMinutes = Math.floor((data.uptime % 3600) / 60);

        document.getElementById("uptime").textContent =
            `${uptimeHours}h ${uptimeMinutes}m`;

    } catch (error) {
        console.error("Instance information error:", error);
    }
}


// Check whether the application is healthy.
async function checkApplicationHealth() {
    const appStatus = document.getElementById("app-status");
    const healthStatus = document.getElementById("health-status");

    try {
        const response = await fetch("/health");

        if (!response.ok) {
            throw new Error("Application is unhealthy");
        }

        appStatus.textContent = "Online";
        appStatus.className = "badge bg-success";

        healthStatus.textContent = "Application is healthy.";

    } catch (error) {
        appStatus.textContent = "Offline";
        appStatus.className = "badge bg-danger";

        healthStatus.textContent = "Application health check failed.";
    }
}


// Update a progress bar with a percentage value.
function updateProgressBar(elementId, percentage, label) {
    const progressBar = document.getElementById(elementId);

    // Handle unavailable measurements without displaying misleading values.
    if (percentage === null || percentage === undefined ||
        !Number.isFinite(Number(percentage))) {
        progressBar.style.width = "0%";
        progressBar.textContent = "N/A";
        progressBar.setAttribute("aria-valuenow", "0");
        return;
    }

    // Keep the displayed percentage within the progress bar's 0-100 range.
    const safePercentage = Math.min(100, Math.max(0, Number(percentage)));

    progressBar.style.width = `${safePercentage}%`;
    progressBar.textContent = label || `${safePercentage.toFixed(1)}%`;
    progressBar.setAttribute("aria-valuenow", safePercentage.toFixed(1));
}


// Load container-level and VM-level resource metrics.
async function loadResourceMetrics() {
    try {
        const response = await fetch("/api/metrics");

        if (!response.ok) {
            throw new Error("Could not retrieve resource metrics");
        }

        const data = await response.json();

        const container = data.container;
        const vm = data.vm;

        // -----------------------------------------
        // Container CPU metrics
        // -----------------------------------------

        updateProgressBar(
            "container-cpu-usage",
            container.cpuUsage
        );

        document.getElementById("container-cpu-capacity").textContent =
            container.cpuCapacityCores !== null
                ? `${container.cpuCapacityCores} cores`
                : "Unavailable";

        document.getElementById("container-cpu-limit").textContent =
            container.cpuLimit !== null
                ? `${container.cpuLimit} cores`
                : "Unlimited";

        // -----------------------------------------
        // Container memory metrics
        // -----------------------------------------

        // Without a memory limit, a limit-based percentage is unavailable.
        updateProgressBar(
            "container-memory-usage",
            container.memoryUsagePercent
        );

        document.getElementById("container-memory-used").textContent =
            container.memoryUsage !== null
                ? `${container.memoryUsage} MiB`
                : "Unavailable";

        document.getElementById("container-memory-limit").textContent =
            container.memoryLimit !== null
                ? `${container.memoryLimit} MiB`
                : "Unlimited";

        // -----------------------------------------
        // VM CPU metrics
        // -----------------------------------------

        updateProgressBar(
            "vm-cpu-usage",
            vm.cpuUsage
        );

        document.getElementById("vm-cpu-cores").textContent =
            vm.cpuCores ?? "Unavailable";

        // -----------------------------------------
        // VM memory metrics
        // -----------------------------------------

        updateProgressBar(
            "vm-memory-usage",
            vm.memoryUsagePercent
        );

        document.getElementById("vm-memory-used").textContent =
            vm.memoryUsage !== null
                ? `${vm.memoryUsage} MiB`
                : "Unavailable";

        document.getElementById("vm-memory-total").textContent =
            vm.memoryTotal !== null
                ? `${vm.memoryTotal} MiB`
                : "Unavailable";

    } catch (error) {
        console.error("Metrics error:", error);
    }
}


// -----------------------------------------
// CPU stress-test controls
// -----------------------------------------

const startButton = document.getElementById("start-stress");
const stopButton = document.getElementById("stop-stress");
const stressStatus = document.getElementById("stress-status");
const countdownDisplay = document.getElementById("stress-countdown");

// Track the dashboard countdown.
let stressCountdown = null;
let remainingSeconds = 60;


// Start the CPU stress test.
startButton.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/stress/start", {
            method: "POST"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        stressStatus.textContent = data.message;

        startButton.disabled = true;
        stopButton.disabled = false;

        // Start the countdown after the backend confirms the workload.
        startCountdown();

    } catch (error) {
        stressStatus.textContent = error.message;
    }
});


// Stop the CPU stress test.
stopButton.addEventListener("click", async () => {
    try {
        const response = await fetch("/api/stress/stop", {
            method: "POST"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        stressStatus.textContent = data.message;

        startButton.disabled = false;
        stopButton.disabled = true;

        // Stop and reset the dashboard countdown.
        stopCountdown();

    } catch (error) {
        stressStatus.textContent = error.message;
    }
});


// Synchronize the dashboard buttons with backend stress-test status.
async function updateStressStatus() {
    try {
        const response = await fetch("/api/stress/status");

        if (!response.ok) {
            throw new Error("Could not retrieve stress-test status");
        }

        const data = await response.json();

        // Update buttons according to the backend state.
        startButton.disabled = data.running;
        stopButton.disabled = !data.running;

        // Display the current stress-test state.
        stressStatus.textContent = data.running
            ? `CPU stress test running (${data.activeWorkers} workers).`
            : "No stress test running.";

    } catch (error) {
        console.error("Stress status error:", error);
    }
}


// Display the remaining stress-test duration.
function updateCountdownDisplay() {
    countdownDisplay.textContent = `${remainingSeconds} seconds`;
}


// Start the 60-second dashboard countdown.
function startCountdown() {
    // Clear any previously running countdown.
    clearInterval(stressCountdown);

    remainingSeconds = 60;
    updateCountdownDisplay();

    // Update the displayed remaining time every second.
    stressCountdown = setInterval(() => {
        remainingSeconds--;

        updateCountdownDisplay();

        // Stop the countdown when it reaches zero.
        if (remainingSeconds <= 0) {
            clearInterval(stressCountdown);
            stressCountdown = null;
        }
    }, 1000);
}


// Stop and reset the dashboard countdown.
function stopCountdown() {
    clearInterval(stressCountdown);
    stressCountdown = null;

    remainingSeconds = 60;
    updateCountdownDisplay();
}


// -----------------------------------------
// Initialize dashboard and periodic updates
// -----------------------------------------

// Load initial information when the dashboard opens.
loadInstanceInfo();
checkApplicationHealth();
loadResourceMetrics();
updateStressStatus();

// Refresh application health every 10 seconds.
setInterval(checkApplicationHealth, 10000);

// Refresh resource metrics every 3 seconds.
setInterval(loadResourceMetrics, 3000);

// Refresh stress-test status every 2 seconds.
setInterval(updateStressStatus, 2000);

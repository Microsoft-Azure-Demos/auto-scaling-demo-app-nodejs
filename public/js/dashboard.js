
// -----------------------------------------
// Instance information
// -----------------------------------------

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


// -----------------------------------------
// Application health
// -----------------------------------------

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


// -----------------------------------------
// Resource monitoring
// -----------------------------------------

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

        // Container CPU metrics.
        updateProgressBar("container-cpu-usage", container.cpuUsage);

        document.getElementById("container-cpu-capacity").textContent =
            container.cpuCapacityCores !== null
                ? `${container.cpuCapacityCores} cores`
                : "Unavailable";

        document.getElementById("container-cpu-limit").textContent =
            container.cpuLimit !== null
                ? `${container.cpuLimit} cores`
                : "Unlimited";

        // Container memory metrics.
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

        // VM CPU metrics.
        updateProgressBar("vm-cpu-usage", vm.cpuUsage);

        document.getElementById("vm-cpu-cores").textContent =
            vm.cpuCores ?? "Unavailable";

        // VM memory metrics.
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


// Retrieve all duration radio buttons.
const durationOptions = document.querySelectorAll(
    'input[name="stress-duration"]'
);

// Track the dashboard countdown interval.
let stressCountdown = null;


// Format seconds as MM:SS.
function formatCountdown(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}


// Display the remaining stress-test duration.
function updateCountdownDisplay(seconds) {
    countdownDisplay.textContent = formatCountdown(seconds);
}


// Start the CPU stress test using the selected duration.
startButton.addEventListener("click", async () => {
    try {
        // Read the selected duration from the dropdown.
        // Get the duration selected by the user.
        const selectedDuration = document.querySelector(
            'input[name="stress-duration"]:checked'
        );

        const durationMinutes = Number(selectedDuration.value);

        // Prevent changing the duration while the request is being processed.
        startButton.disabled = true;
        // Prevent changing the duration while the test is running.
        durationOptions.forEach(option => {
            option.disabled = true;
        });

        const response = await fetch("/api/stress/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                durationMinutes
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        stressStatus.textContent = data.message;

        stopButton.disabled = false;

        // Display the initial countdown returned by the backend.
        updateCountdownDisplay(data.durationSeconds);

        // Synchronize the countdown with the backend.
        await updateStressStatus();

    } catch (error) {
        stressStatus.textContent = error.message;

        startButton.disabled = false;
        stopButton.disabled = true;
        // Allow the user to select another duration.
        durationOptions.forEach(option => {
            option.disabled = false;
        });
    }
});


// Stop the CPU stress test manually.
stopButton.addEventListener("click", async () => {
    try {
        stopButton.disabled = true;

        const response = await fetch("/api/stress/stop", {
            method: "POST"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message);
        }

        stressStatus.textContent = data.message;

        // Reset the countdown after stopping the workload.
        stopCountdown();

        startButton.disabled = false;
        // Allow the user to select a new duration.
        durationOptions.forEach(option => {
            option.disabled = false;
        });

    } catch (error) {
        stressStatus.textContent = error.message;
        stopButton.disabled = false;
    }
});


// -----------------------------------------
// Stress-test status and countdown
// -----------------------------------------

// Synchronize the dashboard with the backend stress-test status.
async function updateStressStatus() {
    try {
        const response = await fetch("/api/stress/status");

        if (!response.ok) {
            throw new Error("Could not retrieve stress-test status");
        }

        const data = await response.json();

        // Synchronize buttons and duration selection.
        startButton.disabled = data.running;
        stopButton.disabled = !data.running;
        // Keep duration options disabled while a test is running.
        durationOptions.forEach(option => {
            option.disabled = data.running;
        });

        if (data.running) {
            stressStatus.textContent =
                `CPU stress test running (${data.activeWorkers} workers).`;

            // Display the backend's remaining time.
            updateCountdownDisplay(data.remainingSeconds);

        } else {
            stressStatus.textContent = "No stress test running.";
            countdownDisplay.textContent = "--";
        }

    } catch (error) {
        console.error("Stress status error:", error);
    }
}


// Stop and reset the dashboard countdown.
function stopCountdown() {
    clearInterval(stressCountdown);
    stressCountdown = null;

    countdownDisplay.textContent = "--";
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

// Refresh stress-test status every second.
setInterval(updateStressStatus, 1000);

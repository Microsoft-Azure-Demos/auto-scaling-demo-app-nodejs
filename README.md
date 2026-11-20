# Auto Scaling Demo App — Node.js

A containerized Node.js application designed to demonstrate CPU monitoring, resource utilization, and controlled workload generation. The application provides a real-time dashboard that can be used to demonstrate infrastructure monitoring and autoscaling concepts.

The project is designed as a practical cloud engineering demonstration, with an initial focus on Azure Virtual Machines and Virtual Machine Scale Sets.

## Project Objectives

The goal is to build an application that can:

- Expose application health and instance information.
- Monitor container-level CPU and memory consumption.
- Monitor virtual-machine-level CPU and memory consumption.
- Generate controlled CPU workloads.
- Automatically stop CPU stress tests after a configured duration.
- Provide a dashboard for observing resource utilization.
- Run consistently inside a Docker container.

## Architecture

```text
                  Browser
                     |
                     v
             Node.js Dashboard
                     |
                     v
              Express.js API
                     |
          +----------+----------+
          |          |          |
          v          v          v
       Instance   Container     VM
       Info       Metrics     Metrics
                     |
                     v
               CPU Workers
               (Worker Threads)
```

### Technology Stack

| Technology | Purpose |
|---|---|
| Node.js | Application runtime |
| Express.js | REST API and web server |
| Docker | Containerization |
| Linux cgroups | Container resource monitoring |
| Worker Threads | Controlled CPU workload |
| HTML, CSS, JavaScript | Monitoring dashboard |

## Application Features

### 1. Instance Information

The dashboard displays:

- Hostname
- Operating system
- CPU architecture
- Available CPU cores
- Private IP addresses
- System uptime

### 2. Container Resource Monitoring

Uses Linux cgroups to retrieve container-level resource information.

- CPU utilization
- Available CPU capacity
- Configured CPU limit, if any
- Memory consumption
- Configured memory limit, if any

### 3. Virtual Machine Resource Monitoring

Displays operating-system resource information visible to the application.

- CPU utilization
- Logical CPU cores
- Memory utilization
- Used memory
- Total memory

**Note:** In Docker Desktop, VM metrics represent the Linux environment visible to the container, which may be Docker's Linux VM rather than the physical Windows host.

### 4. Application Health

The health endpoint allows external monitoring systems to verify that the application is running.

### 5. CPU Stress Testing

The application supports controlled CPU workload generation using Node.js Worker Threads.

- Starts CPU-intensive worker threads.
- Uses the available CPU cores.
- Automatically stops the workload after 60 seconds.
- Allows the workload to be stopped manually.
- Displays the stress-test status on the dashboard.

This functionality helps demonstrate how CPU utilization increases under load and returns to normal after the workload stops.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Application health check |
| GET | `/api/instance` | Instance information |
| GET | `/api/metrics` | Container and VM metrics |
| GET | `/api/stress/status` | CPU stress-test status |
| POST | `/api/stress/start` | Start CPU stress test |
| POST | `/api/stress/stop` | Stop CPU stress test |

### Example: Health Check

```http
GET /health
```

Example response:

```json
{
  "status": "healthy",
  "timestamp": "2026-11-20T00:00:00.000Z"
}
```

### Example: Resource Metrics

```http
GET /api/metrics
```

The response contains separate `container` and `vm` objects.

## Run Locally with Docker

### Prerequisites

- Docker Desktop or Docker Engine
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Microsoft-Azure-Demos/auto-scaling-demo-app-nodejs.git
cd auto-scaling-demo-app-nodejs-v2
```

### 2. Build the Docker image

```bash
docker build -t auto-scaling-demo-app-nodejs:1.0 .
```

### 3. Run the container

```bash
docker run -d \
  --name auto-scaling-demo \
  -p 3000:3000 \
  auto-scaling-demo-app-nodejs:1.0
```

### 4. Access the application

Open the dashboard:

```text
http://localhost:3000
```

Check application health:

```text
http://localhost:3000/health
```

Retrieve resource metrics:

```text
http://localhost:3000/api/metrics
```

### 5. Stop and remove the container

```bash
docker stop auto-scaling-demo
docker rm auto-scaling-demo
```

## Demonstration: CPU Stress Testing

1. Start the application.
2. Open the dashboard.
3. Start the CPU stress test.
4. Observe container and VM CPU utilization.
5. Wait for the automatic 60-second timeout.
6. Observe CPU utilization returning to normal.

This demonstrates how a workload can create CPU pressure, which is useful when testing infrastructure autoscaling.

## Project Roadmap

The project will be extended to demonstrate cloud infrastructure and autoscaling.

| Phase | Description | Status |
|---|---|---|
| 1 | Develop Node.js monitoring application | Completed |
| 2 | Containerize application with Docker | Completed |
| 3 | Implement container and VM metrics | Completed |
| 4 | Implement controlled CPU stress testing | Completed |
| 5 | Publish source code to GitHub | Planned |
| 6 | Publish Docker image to Docker Hub | Planned |
| 7 | Deploy application to Azure Virtual Machines | Planned |
| 8 | Deploy application using Azure VM Scale Sets | Planned |
| 9 | Configure Azure Monitor autoscaling | Planned |

## Important Security Considerations

The CPU stress-test endpoints are intended for controlled demonstrations.

Before exposing the application publicly:

- Protect stress-test endpoints with authentication.
- Enforce workload duration and concurrency limits.
- Restrict access to administrative operations.
- Avoid exposing the application without appropriate network security controls.

## Learning Outcomes

This project demonstrates practical experience with:

- Node.js application development
- REST API design
- Docker image creation and container execution
- Linux cgroups and resource monitoring
- CPU workload generation using Worker Threads
- Cloud infrastructure monitoring concepts
- Azure Virtual Machines and VM Scale Sets (planned)

## License

This project is free to use.

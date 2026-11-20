const { parentPort } = require("worker_threads");

let result = 0;

while (true) {
    for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i);
    }

    if (result > 1e15) {
        result = 0;
    }
}
import 'dotenv/config';

const minimumNodeMajor = 22;
const nodeMajor = Number(process.versions.node.split('.')[0]);
const failures = [];
const notices = [];

if (!Number.isInteger(nodeMajor) || nodeMajor < minimumNodeMajor) {
  failures.push(`Node.js ${minimumNodeMajor} or newer is required; found ${process.versions.node}.`);
}

if (!process.env.GEMINI_API_KEY) {
  notices.push('GEMINI_API_KEY is unset; Gemini network calls are disabled, while bounded local extraction remains available.');
}

notices.push('Firebase emulator commands additionally require Java 21 or newer until PostgreSQL replaces Firebase.');

for (const notice of notices) console.warn(`NOTICE: ${notice}`);
for (const failure of failures) console.error(`ERROR: ${failure}`);

if (failures.length > 0) process.exit(1);
console.log(`Preflight passed with Node.js ${process.versions.node}.`);

const fs = require("fs");
const path = require("path");

const transcriptPath = "C:\\Users\\Victus\\.gemini\\antigravity\\brain\\6b6777dd-2d51-4b56-8260-e932ae8e9132\\.system_generated\\logs\\transcript.jsonl";

if (!fs.existsSync(transcriptPath)) {
  console.error("Transcript file not found at:", transcriptPath);
  process.exit(1);
}

const lines = fs.readFileSync(transcriptPath, "utf-8").split("\n");
const userMessages = [];

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const step = JSON.parse(line);
    if (step.type === "USER_INPUT") {
      userMessages.push({
        index: step.step_index,
        time: step.created_at,
        content: step.content
      });
    }
  } catch (e) {
    // Ignore invalid JSON lines
  }
}

console.log("Last 20 User Messages:");
const lastMessages = userMessages.slice(-20);
for (const msg of lastMessages) {
  console.log(`[Step ${msg.index}] [${msg.time}]`);
  console.log(msg.content);
  console.log("-".repeat(40));
}

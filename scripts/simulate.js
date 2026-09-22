import { randomBytes } from "node:crypto";
const origin = process.env.APP_ORIGIN || "http://localhost:3001";
const deviceId = process.env.DEVICE_ID;
const apiKey = process.env.DEVICE_API_KEY;
if (!deviceId || !apiKey)
  throw new Error(
    "Configure DEVICE_ID e DEVICE_API_KEY apenas no ambiente local.",
  );
const headers = {
  "Content-Type": "application/json",
  "x-device-id": deviceId,
  "x-api-key": apiKey,
};
const configResponse = await fetch(`${origin}/api/v1/device/config`, {
  headers,
});
if (!configResponse.ok)
  throw new Error(`Config: HTTP ${configResponse.status}`);
const config = await configResponse.json();
const body = {
  deviceId,
  bootId: randomBytes(8).toString("hex"),
  sequence: 0,
  uptimeMs: 60000,
  ageMs: 0,
  configVersion: config.version,
  droppedSamples: 0,
  manualAlarm: false,
  readings: config.sensors.map((s) => ({
    channel: s.channel,
    value: Math.max(0, s.low - 100),
    state: "NORMAL",
  })),
};
const response = await fetch(`${origin}/api/v1/telemetry`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
console.log(`Simulação NORMAL: HTTP ${response.status}`);
if (!response.ok) process.exitCode = 1;

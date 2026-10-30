#!/usr/bin/env node

/**
 * Obsera honeypot agent: follows Cowrie's JSON log and forwards failed SSH logins
 * to the Obsera backend, plus a periodic heartbeat so the dashboard shows the sensor as live.
 *
 *   node honeypot-agent.js          follow the log (default, same as "monitor")
 *   node honeypot-agent.js test     check backend URL and token with one heartbeat, then exit
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Tail } = require("tail");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const API_URL = (process.env.OBSERA_API_URL || "http://localhost:4000").replace(/\/+$/, "");
const INGEST_TOKEN = process.env.OBSERA_INGEST_TOKEN;
const COWRIE_LOG_PATH = process.env.COWRIE_LOG_PATH || "/home/cowrie/cowrie/var/log/cowrie/cowrie.json";
const SENSOR_ID = process.env.SENSOR_ID || os.hostname();
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS) || 60 * 1000;
const LOG_FILE = path.join(process.env.LOG_DIR || os.tmpdir(), "honeypot-agent.log");

const INGEST_ENDPOINT = `${API_URL}/api/attack-logs`;
const HEARTBEAT_ENDPOINT = `${API_URL}/api/sensors/heartbeat`;

function log(message) {
  const msg = `[${new Date().toISOString()}] ${message}`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, msg + "\n"); } catch (e) {}
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// POST a JSON body with the ingest token; resolves with the status code on 2xx
function postJson(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(endpoint);
    const req = (url.protocol === "https:" ? https : http).request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "Authorization": `Bearer ${INGEST_TOKEN}`,
      },
      timeout: 5000,
    }, (res) => {
      // Drain the body so "end" fires and the socket is released
      res.resume();
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.statusCode);
        else if (res.statusCode === 401) reject(new Error("HTTP 401: OBSERA_INGEST_TOKEN does not match the backend's INGEST_TOKEN"));
        else reject(new Error(`HTTP ${res.statusCode}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const sendAttackLog = (attack) => postJson(INGEST_ENDPOINT, {
  source_ip: attack.sourceIp,
  username_attempt: attack.username || null,
  password_attempt: attack.password || null,
  access_time: attack.timestamp,
  attack_type: "ssh_attempt",
  port: 22,
  protocol: "ssh",
  sensor_id: SENSOR_ID,
});

// Tell the dashboard this sensor is alive even when no attacks arrive
const sendHeartbeat = () => postJson(HEARTBEAT_ENDPOINT, { sensor_id: SENSOR_ID, hostname: os.hostname(), version: "1" });

function parseCowrieJSON(jsonLine) {
  try {
    const entry = JSON.parse(jsonLine);
    if (entry.eventid === "cowrie.login.failed") {
      return {
        username: entry.username || "unknown",
        password: entry.password || "none",
        sourceIp: entry.src_ip || entry.sourceIP || null,
        timestamp: entry.timestamp,
      };
    }
    return null;
  } catch (e) { return null; }
}

function monitorCowrieLog() {
  if (!fs.existsSync(COWRIE_LOG_PATH)) {
    fail(`Cowrie log not found at ${COWRIE_LOG_PATH}. Set COWRIE_LOG_PATH to Cowrie's cowrie.json.`);
  }

  log(`🚀 Obsera agent "${SENSOR_ID}" following ${COWRIE_LOG_PATH} -> ${API_URL}`);

  const heartbeat = () => sendHeartbeat().catch((error) => log(`⚠️ Heartbeat failed: ${error.message}`));
  heartbeat();
  setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);

  const tail = new Tail(COWRIE_LOG_PATH, { fromBeginning: false });
  tail.on("error", (error) => log(`⚠️ Tail error: ${error.message || error}`));

  tail.on("line", async (line) => {
    const attack = parseCowrieJSON(line);

    // Only forward entries with a source IP and at least one credential
    if (!attack || !attack.sourceIp || !(attack.username || attack.password)) return;

    try {
      attack.timestamp = attack.timestamp ? new Date(attack.timestamp).toISOString() : new Date().toISOString();
      await sendAttackLog(attack);
      log(`✓ Sent: ${attack.sourceIp} - ${attack.username}`);
    } catch (error) {
      log(`⚠️ Error: ${error.message}`);
    }
  });
}

async function testConnection() {
  try {
    await sendHeartbeat();
    console.log(`✓ Backend reachable at ${API_URL} and ingest token accepted (sensor "${SENSOR_ID}")`);
  } catch (error) {
    fail(`Connection test failed: ${error.message}`);
  }
}

if (!INGEST_TOKEN) {
  fail("OBSERA_INGEST_TOKEN is not set. Copy agent/.env.example to agent/.env and set it to the backend's INGEST_TOKEN.");
}

const mode = process.argv[2] || "monitor";
if (mode === "test") testConnection();
else if (mode === "monitor") monitorCowrieLog();
else fail(`Unknown mode "${mode}". Usage: node honeypot-agent.js [monitor|test]`);

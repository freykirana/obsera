#!/usr/bin/env node

/**
 * Reset an admin's password from the terminal.
 *
 *   npm run reset-password -- admin@example.com
 *
 * The password is typed twice without echo, stored as a bcrypt hash and never printed.
 * Existing sessions of that account are signed out (see password_changed_at).
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const prisma = require("../src/config/prisma");
const { MIN_PASSWORD_LENGTH, setUserPassword } = require("../src/services/password.service");

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

// Piped input (no TTY) is read once and consumed line by line
let pipedLines;
async function readPipedLine() {
  if (!pipedLines) {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    pipedLines = data.split(/\r?\n/);
  }
  return pipedLines.shift() ?? "";
}

// Read one line without echoing it
async function promptHidden(question) {
  const stdin = process.stdin;
  process.stdout.write(question);

  if (!stdin.isTTY) {
    const line = await readPipedLine();
    process.stdout.write("\n");
    return line;
  }

  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) return fail("Usage: npm run reset-password -- <email>");

  const user = await prisma.users.findUnique({ where: { email }, select: { user_id: true } });
  if (!user) return fail(`No account found for ${email}`);

  const password = await promptHidden(`New password for ${email}: `);
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`);

  const confirmation = await promptHidden("Confirm new password: ");
  if (password !== confirmation) return fail("Passwords do not match. Nothing was changed.");

  await setUserPassword(user.user_id, password);
  console.log(`✓ Password updated for ${email}. Existing sessions for this account were signed out.`);
}

main()
  .catch((error) => fail(`Reset failed: ${error.message}`))
  .finally(() => prisma.$disconnect());

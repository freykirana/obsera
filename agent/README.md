# Obsera honeypot agent

A small Node.js process that runs next to [Cowrie](https://github.com/cowrie/cowrie) on the honeypot host. It follows Cowrie's JSON log and, for every `cowrie.login.failed` event, sends the source IP, username and password to the Obsera backend (`POST /api/attack-logs`). It also sends a heartbeat (`POST /api/sensors/heartbeat`) every minute, so the dashboard shows the sensor as live when no attacks arrive.

Both requests carry `Authorization: Bearer <OBSERA_INGEST_TOKEN>`. The backend rejects them unless the token matches its `INGEST_TOKEN`.

## Configuration

Copy `.env.example` to `.env` in this folder and fill it in:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OBSERA_API_URL` | no | `http://localhost:4000` | Backend base URL |
| `OBSERA_INGEST_TOKEN` | **yes** | none | Must equal `INGEST_TOKEN` in `backend/.env`. The agent exits if it is empty |
| `COWRIE_LOG_PATH` | no | `/home/cowrie/cowrie/var/log/cowrie/cowrie.json` | Cowrie JSON log to follow |
| `SENSOR_ID` | no | hostname | Sensor name shown in the dashboard |
| `HEARTBEAT_INTERVAL_MS` | no | `60000` | Heartbeat interval |
| `LOG_DIR` | no | system temp dir | Where `honeypot-agent.log` is written |

Generate a token once and put the same value in both `backend/.env` (`INGEST_TOKEN`) and `agent/.env` (`OBSERA_INGEST_TOKEN`):

```bash
openssl rand -hex 32
```

## Running

```bash
cd agent
npm install
npm test     # sends one heartbeat to check the URL and token, then exits
npm start    # follows the Cowrie log
```

The agent reads only new lines (it does not replay the existing log). It needs read access to the Cowrie log, so run it as the `cowrie` user or a user in the same group.

### As a systemd service

`/etc/systemd/system/obsera-agent.service`:

```ini
[Unit]
Description=Obsera honeypot agent
After=network-online.target

[Service]
User=cowrie
WorkingDirectory=/opt/obsera/agent
ExecStart=/usr/bin/node honeypot-agent.js monitor
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now obsera-agent
journalctl -u obsera-agent -f
```

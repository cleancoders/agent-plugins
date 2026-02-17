#!/usr/bin/env python3
"""KanBan Dashboard Server for Agent Swarm Monitoring"""

import http.server
import json
import os
from datetime import datetime

DASHBOARD_DIR = '/tmp/kanban-dashboard'
STATUS_DIR = os.path.join(DASHBOARD_DIR, 'status')
LOG_FILE = os.path.join(DASHBOARD_DIR, 'activity.log')

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def log_message(self, format, *args):
        pass  # Suppress request logging

    def do_GET(self):
        if self.path == '/api/status':
            self.send_status()
        elif self.path == '/api/log':
            self.send_log()
        elif self.path == '/':
            self.path = '/index.html'
            super().do_GET()
        else:
            super().do_GET()

    def send_json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    def send_status(self):
        try:
            with open(os.path.join(DASHBOARD_DIR, 'tasks.json')) as f:
                data = json.load(f)
        except Exception:
            self.send_json({"error": "tasks.json not found"})
            return

        for task in data['tasks']:
            status_file = os.path.join(STATUS_DIR, f'task-{task["id"]}.json')
            if os.path.exists(status_file):
                try:
                    with open(status_file) as f:
                        status = json.load(f)
                    task.update(status)
                except Exception:
                    pass

        data['server_time'] = datetime.now().isoformat()
        self.send_json(data)

    def send_log(self):
        entries = []
        if os.path.exists(LOG_FILE):
            try:
                with open(LOG_FILE) as f:
                    lines = f.readlines()[-50:]  # Last 50 entries
                    for line in lines:
                        line = line.strip()
                        if line:
                            try:
                                entries.append(json.loads(line))
                            except Exception:
                                entries.append({"message": line, "time": ""})
            except Exception:
                pass
        self.send_json({"entries": entries})

if __name__ == '__main__':
    os.makedirs(STATUS_DIR, exist_ok=True)
    port = 3333
    server = http.server.HTTPServer(('localhost', port), DashboardHandler)
    print(f'KanBan Dashboard running at http://localhost:{port}')
    server.serve_forever()

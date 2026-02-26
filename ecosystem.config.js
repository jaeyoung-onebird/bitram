module.exports = {
  apps: [
    {
      name: "backend",
      script: "/home/ubuntu/onebird/backend/venv/bin/uvicorn",
      args: "main:app --host 0.0.0.0 --port 8000",
      cwd: "/home/ubuntu/onebird/backend",
      interpreter: "none",
      autorestart: true,
      max_restarts: 3,
      restart_delay: 10000,
      kill_timeout: 10000,
    },
    {
      name: "frontend",
      script: "server.js",
      cwd: "/home/ubuntu/onebird/frontend/.next/standalone",
      node_args: "--max-old-space-size=256",
      env: { PORT: 3000, HOSTNAME: "0.0.0.0" },
      autorestart: true,
      max_restarts: 3,
      restart_delay: 10000,
      kill_timeout: 10000,
    },
  ],
};

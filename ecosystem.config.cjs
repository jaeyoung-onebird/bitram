module.exports = {
  apps: [
    {
      name: "frontend",
      cwd: "/home/ubuntu/onebird/frontend/.next/standalone",
      script: "server.js",
      env: {
        PORT: 3000,
        HOSTNAME: "0.0.0.0",
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      node_args: "--max-old-space-size=512",
    },
  ],
};

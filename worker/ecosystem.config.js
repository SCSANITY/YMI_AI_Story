const path = require('path')

module.exports = {
  apps: [
    {
      name: 'ymi-worker',
      cwd: __dirname,
      script: path.join(__dirname, 'node_modules', 'ts-node', 'dist', 'bin.js'),
      args: 'index.ts',
      interpreter: 'node',
      autorestart: true,
      max_memory_restart: '1G',
      min_uptime: '30s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      kill_timeout: 300000,
      out_file: path.join(__dirname, 'logs', 'worker-out.log'),
      error_file: path.join(__dirname, 'logs', 'worker-error.log'),
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}

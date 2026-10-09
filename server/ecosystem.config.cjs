// PM2 process definition (§26). Build first: npm run build && pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'birds-api',
      script: 'dist/src/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' },
    },
  ],
};

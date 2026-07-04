module.exports = {
  apps: [
    {
      name: 'tecpey-web',
      script: 'server.ts',
      interpreter: 'tsx',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000'
      }
    }
  ]
};

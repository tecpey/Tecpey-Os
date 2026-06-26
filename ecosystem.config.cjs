module.exports = {
  apps: [
    {
      name: 'tecpey-web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
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

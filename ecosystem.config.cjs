module.exports = {
  apps: [
    {
      name: 'tecpey-web',
      script: 'dist/run-production-bootstrap.cjs',
      args: 'server',
      interpreter: 'node',
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

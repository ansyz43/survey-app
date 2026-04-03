const fs = require('fs')
const path = require('path')

// Parse .env file into key-value pairs
function loadEnv(envPath) {
  const env = {}
  try {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.substring(0, idx).trim()
      let val = trimmed.substring(idx + 1).trim()
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      env[key] = val
    }
  } catch (e) {
    console.error('Failed to load .env:', e.message)
  }
  return env
}

const envVars = loadEnv(path.join(__dirname, '.env'))

module.exports = {
  apps: [
    {
      name: 'survey-app',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      env: envVars,
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
    },
  ],
}

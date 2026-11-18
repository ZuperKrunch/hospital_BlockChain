import { spawn } from 'node:child_process'

const children = []
const demo = process.argv.includes('--demo')
const stop = () => children.forEach(child => child.kill())
for (const args of [
  ['server/start.mjs', ...(demo ? ['--demo'] : [])],
  ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '5173', '--strictPort'],
]) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' })
  children.push(child)
  child.once('exit', code => { process.exitCode = code ?? 0; stop() })
  child.once('error', error => { console.error(error.message); process.exitCode = 1; stop() })
}
process.once('SIGTERM', stop)
process.once('SIGINT', stop)

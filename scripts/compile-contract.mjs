import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'contracts/hospital-v2.sol'), 'utf8')
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'hospital-v2.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
})))
for (const error of output.errors || []) console.error(error.formattedMessage)
if ((output.errors || []).some(e => e.severity === 'error')) process.exit(1)
const compiled = output.contracts['hospital-v2.sol'].MedicalRecordSystem
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true })
fs.writeFileSync(path.join(root, 'artifacts/MedicalRecordSystem.json'), JSON.stringify(compiled, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'src/MedicalRecordSystem.json'), JSON.stringify(compiled.abi, null, 2) + '\n')
console.log(`Solidity ${solc.version()}: contract compiled; ABI synchronized. Runtime: ${compiled.evm.deployedBytecode.object.length / 2} bytes.`)

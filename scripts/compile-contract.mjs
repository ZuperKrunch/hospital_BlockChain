import { readFileSync, writeFileSync } from 'node:fs'
import solc from 'solc'

const file = 'RuangSehat.sol'
const content = readFileSync(new URL('../contracts/' + file, import.meta.url), 'utf8')
const output = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity',
  sources: { [file]: { content } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
})))
for (const error of output.errors ?? []) console.error(error.formattedMessage)
if (output.errors?.some(error => error.severity === 'error')) process.exit(1)
const contract = output.contracts[file].RuangSehat
writeFileSync(new URL('../server/contract.json', import.meta.url), JSON.stringify({ abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object }, null, 2) + '\n')

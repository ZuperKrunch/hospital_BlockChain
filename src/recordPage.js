export async function readRecordPage(contract, patient, requestedPage = 0) {
  // Count and rows use one block so simultaneous additions cannot shift IDs.
  const blockTag = await contract.runner.provider.getBlockNumber()
  const count = await contract.getRecordCount(patient, { blockTag })
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Jumlah record terlalu besar untuk tampilan ini.')
  const total = Number(count)
  const page = Math.max(0, Math.min(requestedPage, Math.max(0, Math.ceil(total / 10) - 1)))
  const end = Math.max(0, total - page * 10)
  const offset = Math.max(0, end - 10)
  const result = total ? await contract.getRecordsPage(patient, offset, end - offset, { blockTag }) : []
  const records = Array.from(result, (r, i) => ({
    id: offset + i, data: r.data, doctor: r.doctor,
    createdAt: Number(r.createdAt), updatedAt: Number(r.updatedAt), isActive: r.isActive,
  })).reverse()
  return { records, total, page }
}

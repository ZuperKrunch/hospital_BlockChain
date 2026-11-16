import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
const server = await createServer({server:{middlewareMode:true},appType:'custom'})
let checks=0
function check(actual, expected) {assert.equal(actual,expected);checks++}
try {
  const medical = await server.ssrLoadModule('/src/medical.js')
  const {default: RecordsTable}=await server.ssrLoadModule('/src/RecordsTable.jsx')
  const {default: MedicalForm}=await server.ssrLoadModule('/src/MedicalForm.jsx')
  const {readRecordPage}=await server.ssrLoadModule('/src/recordPage.js')
  const form={...medical.EMPTY_MEDICAL,patientName:'Pasien Contoh',diagnosis:'Simulasi',height:'170.5',weight:'65.2'}
  const data=medical.toMedicalData(form)
  check(data.heightCmX10,1705);check(data.weightKgX10,652)
  check(medical.toMedicalData({...form,height:'',weight:''}).heightCmX10,0)
  for(const bad of [{height:'0'},{height:'301'},{weight:'701'},{weight:'65.22'},{patientName:''},{diagnosis:''},{notes:'é'.repeat(1001)},{birthDate:'2999-01-01'}]) {
    assert.throws(()=>medical.toMedicalData({...form,...bad}));checks++
  }
  check(medical.displayMeasure(0,'kg'),'Belum diukur')
  const doctor='0x1111111111111111111111111111111111111111'
  const patient='0x2222222222222222222222222222222222222222'
  const record={id:0,data,doctor,createdAt:1700000000,updatedAt:1700000000,isActive:true}
  check(medical.recordToForm(record).weight,'65.2')
  const base={records:[record],total:1,page:0,busy:false,account:patient,patient,editingId:null}
  let html=renderToStaticMarkup(React.createElement(RecordsTable,base))
  check(html.includes('170.5 cm'),true);check(html.includes('65.2 kg'),true)
  check(html.includes('>Edit</button>'),false);check(html.includes('>Delete</button>'),false)
  html=renderToStaticMarkup(React.createElement(RecordsTable,{...base,account:doctor,onEdit:()=>{}}))
  check(html.includes('>Edit</button>'),true);check(html.includes('>Delete</button>'),true)
  html=renderToStaticMarkup(React.createElement(RecordsTable,{...base,account:doctor,onEdit:()=>{},editingId:0,editForm:form}))
  check(html.includes('Edit Record #0'),true);check(html.includes('Simpan Perubahan'),true)
  check(html.includes('Tambah Record ke Blockchain'),false)
  html=renderToStaticMarkup(React.createElement(RecordsTable,{...base,account:doctor,onEdit:()=>{},records:[{...record,isActive:false}]}))
  check(html.includes('>Deleted</span>'),true);check(html.includes('>Edit</button>'),false)
  html=renderToStaticMarkup(React.createElement(MedicalForm,{value:form,prefix:'test',disabled:true,submitLabel:'Tambah Record'}))
  check((html.match(/<textarea/g)||[]).length,6);check(html.includes('<fieldset disabled=""'),true)
  const all=Array.from({length:12},(_,i)=>({...record,data:{...data,diagnosis:'Record '+i}}))
  const fake={runner:{provider:{getBlockNumber:async()=>100}},getRecordCount:async()=>12n,getRecordsPage:async(_p,offset,limit,options)=>{
    check(options.blockTag,100);return all.slice(offset,offset+limit)
  }}
  let page=await readRecordPage(fake,patient,0)
  check(page.records.length,10);check(page.records[0].id,11);check(page.records[9].id,2)
  page=await readRecordPage(fake,patient,1)
  check(page.records.length,2);check(page.records[0].id,1);check(page.records[1].id,0)
  page=await readRecordPage(fake,patient,999)
  check(page.page,1)
  console.log(`PASS: ${checks} frontend validation/render checks: units, empty values, text limits, author controls, separate edit form, and stable paginated IDs.`)
} finally {await server.close()}

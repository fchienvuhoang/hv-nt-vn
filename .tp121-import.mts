import env from '@next/env';env.loadEnvConfig(process.cwd());
import {readFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {readFundWorkbook} from './src/lib/fund-excel';
const bytes=await readFile('/tmp/hvntvn-tp121-import.xlsx');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
for(const sheet of book.worksheets){console.log('SHEET',sheet.name,sheet.rowCount);for(let i=1;i<=Math.min(7,sheet.rowCount);i++)console.log(i,JSON.stringify(sheet.getRow(i).values));for(let i=Math.max(8,sheet.rowCount-3);i<=sheet.rowCount;i++)console.log(i,JSON.stringify(sheet.getRow(i).values))}
const sheets=await readFundWorkbook(bytes,'TP121.xlsx');console.log('PARSED',JSON.stringify(sheets.map(s=>({...s,rows:undefined,count:s.rows.length,first:s.rows[0],last:s.rows.at(-1),undated:s.rows.filter(r=>r.dateUnknown).length}))));
const {db}=await import('./src/lib/db');try{const funds=await db.fund.findMany({where:{code:'TP121'}});console.log('FUNDS',JSON.stringify(funds,(_,v)=>typeof v==='bigint'?String(v):v));for(const f of funds)console.log('EXISTING',await db.bankTransaction.groupBy({by:['origin','entryStatus','direction'],where:{fundId:f.id},_count:true,_sum:{amount:true}}))}finally{await db.$disconnect()}

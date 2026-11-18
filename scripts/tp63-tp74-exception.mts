import dotenv from 'dotenv';
dotenv.config({path:'.env.local',quiet:true});
const {db} = await import('../src/lib/db');
try {
 const {runTp63Tp74Exception} = await import('../src/lib/tp63-tp74-exception');
 console.log(JSON.stringify(await runTp63Tp74Exception(process.argv.includes('--commit'))));
} finally {
 await db.$disconnect();
}

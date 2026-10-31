import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  for (const account of [
    { number: "0572", owner: "HO THI TRA MY", label: "Hộ trì Tam Bảo" },
    { number: "0856", owner: "TRAN THU TRAM", label: "Phụng sự cộng đồng" },
  ]) await db.bankAccount.upsert({ where: { number: account.number }, create: account, update: {} });
  const accounts = await db.bankAccount.findMany({select:{id:true}});
  for (const fund of await db.fund.findMany({select:{id:true,accountId:true}}))
    await db.fund.update({where:{id:fund.id},data:{accountIds:accounts.filter(a=>a.id!==fund.accountId).map(a=>a.id)}});
}
main().finally(() => db.$disconnect());

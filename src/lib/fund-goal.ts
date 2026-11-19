import { z } from "zod";

// Add future goal types here and in resolveFundGoal; each fund has one active type.
export const FUND_GOAL_TYPES = [
  { value: "MONEY", label: "Theo số tiền" },
  { value: "LENGTH", label: "Theo chiều dài (mét)" },
  { value: "PARTS", label: "Theo phần" },
] as const;
export const fundGoalTypeSchema = z.enum(FUND_GOAL_TYPES.map(type => type.value));
export type PartGoalConfig = { version: 1; unit: "part"; unitPrice: string; quantity: string };
type PricedGoalConfig = { unitPrice: string; quantity: string };
export type FundGoalType = typeof FUND_GOAL_TYPES[number]["value"];
export type LengthGoalConfig = { version: 2; unit: "m"; unitPrice: string; width: string; quantity: string };
const MAX_MONEY = 999999999999999n;
const SCALE = 10000n;
const decimalPattern = /^\d{1,9}(?:[.,]\d{1,4})?$/;
function measureUnits(value: string) {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(4, "0"));
}
function normalizedMeasure(value: string) {
  const [whole, fraction = ""] = value.replace(",", ".").split(".");
  const tail = fraction.replace(/0+$/, "");
  return `${BigInt(whole)}${tail ? `.${tail}` : ""}`;
}
const dimension = z.string().trim().regex(decimalPattern, "Nhập số mét hợp lệ, tối đa 4 chữ số thập phân");
const lengthSchema = z.object({
  goalUnitPrice: z.string().regex(/^[1-9]\d{0,14}$/, "Đơn giá mỗi mét dài phải là số tiền VND nguyên lớn hơn 0"),
  goalWidth: dimension,
  goalQuantity: dimension,
}).superRefine((value, ctx) => {
  if (!decimalPattern.test(value.goalWidth) || !decimalPattern.test(value.goalQuantity) || !/^[1-9]\d{0,14}$/.test(value.goalUnitPrice)) return;
  const width = measureUnits(value.goalWidth), length = measureUnits(value.goalQuantity);
  if (width <= 0n) ctx.addIssue({ code: "custom", path: ["goalWidth"], message: "Bề rộng phải lớn hơn 0" });
  if (length <= 0n) ctx.addIssue({ code: "custom", path: ["goalQuantity"], message: "Chiều dài mục tiêu phải lớn hơn 0" });
  if ((length * BigInt(value.goalUnitPrice) + SCALE - 1n) / SCALE > MAX_MONEY)
    ctx.addIssue({ code: "custom", path: ["goalQuantity"], message: "Tổng mục tiêu không được vượt 999.999.999.999.999₫" });
}).transform(value => ({
  goalType: "LENGTH" as const,
  // Round only the final fractional VND up, never intermediate unit costs or lengths.
  goalAmount: (measureUnits(value.goalQuantity) * BigInt(value.goalUnitPrice) + SCALE - 1n) / SCALE,
  goalConfig: { version: 2, unit: "m", unitPrice: value.goalUnitPrice, width: normalizedMeasure(value.goalWidth), quantity: normalizedMeasure(value.goalQuantity) } as LengthGoalConfig,
}));
export function calculateLengthGoal(unitPrice: string, width: string, quantity: string) {
  return lengthSchema.parse({ goalUnitPrice: unitPrice, goalWidth: width, goalQuantity: quantity });
}
export function readLengthGoal(goalType?: string, config?: unknown): LengthGoalConfig | null {
  if (goalType !== "LENGTH" || !config || typeof config !== "object") return null;
  const value = config as Record<string, unknown>;
  if ((value.version !== 1 && value.version !== 2) || value.unit !== "m" || typeof value.unitPrice !== "string" || typeof value.width !== "string" || typeof value.quantity !== "string") return null;
  const result = lengthSchema.safeParse({ goalUnitPrice: value.unitPrice, goalWidth: value.width, goalQuantity: value.quantity });
  return result.success ? result.data.goalConfig : null;
}
const partSchema = z.object({
  goalUnitPrice: z.string().regex(/^[1-9]\d{0,14}$/, "Giá trị mỗi phần phải là số tiền VND nguyên lớn hơn 0"),
  goalQuantity: z.string().trim().regex(/^[1-9]\d{0,8}$/, "Tổng số phần phải là số nguyên dương, tối đa 999.999.999 phần"),
}).superRefine((value, ctx) => {
  if (!/^[1-9]\d{0,14}$/.test(value.goalUnitPrice) || !/^[1-9]\d{0,8}$/.test(value.goalQuantity)) return;
  if (BigInt(value.goalUnitPrice) * BigInt(value.goalQuantity) > MAX_MONEY)
    ctx.addIssue({ code: "custom", path: ["goalQuantity"], message: "Tổng mục tiêu không được vượt 999.999.999.999.999₫" });
}).transform(value => ({
  goalType: "PARTS" as const,
  goalAmount: BigInt(value.goalUnitPrice) * BigInt(value.goalQuantity),
  goalConfig: { version: 1, unit: "part", unitPrice: value.goalUnitPrice, quantity: value.goalQuantity } as PartGoalConfig,
}));
export function calculatePartGoal(unitPrice: string, quantity: string) {
  return partSchema.parse({ goalUnitPrice: unitPrice, goalQuantity: quantity });
}
export function readPartGoal(goalType?: string, config?: unknown): PartGoalConfig | null {
  if (goalType !== "PARTS" || !config || typeof config !== "object") return null;
  const value = config as Record<string, unknown>;
  if (value.version !== 1 || value.unit !== "part" || typeof value.unitPrice !== "string" || typeof value.quantity !== "string") return null;
  const result = partSchema.safeParse({ goalUnitPrice: value.unitPrice, goalQuantity: value.quantity });
  return result.success ? result.data.goalConfig : null;
}
export function resolveFundGoal(input: { goalType?: FundGoalType; goalAmount?: bigint | null; goalUnitPrice?: string; goalWidth?: string; goalQuantity?: string }, current?: { goalType: string; goalAmount: bigint | null; goalConfig: unknown } | null) {
  if (input.goalType === undefined && input.goalAmount === undefined)
    return { goalType: current?.goalType ?? "MONEY", goalAmount: current?.goalAmount ?? null, goalConfig: current?.goalConfig ?? null };
  if (input.goalType === "PARTS") return calculatePartGoal(input.goalUnitPrice ?? "", input.goalQuantity ?? "");
  if (input.goalType === "LENGTH") return calculateLengthGoal(input.goalUnitPrice ?? "", input.goalWidth ?? "", input.goalQuantity ?? "");
  return { goalType: "MONEY", goalAmount: input.goalAmount === undefined ? current?.goalAmount ?? null : input.goalAmount, goalConfig: null };
}
export function formatMeasure(value: string) {
  const [whole, fraction] = normalizedMeasure(value).split(".");
  return `${BigInt(whole).toLocaleString("vi-VN")}${fraction ? `,${fraction}` : ""}`;
}
export function goalArea(config: LengthGoalConfig) {
  const units = measureUnits(config.width) * measureUnits(config.quantity), scale = SCALE * SCALE;
  return formatMeasure(`${units / scale}.${(units % scale).toString().padStart(8, "0")}`);
}
function fundedQuantityUnits(income: bigint, config: PricedGoalConfig) {
  return (income > 0n ? income : 0n) * SCALE / BigInt(config.unitPrice);
}
function displayQuantityUnits(units: bigint, compact: boolean) {
  if (compact) {
    if (units > 0n && units < SCALE / 10n) return "<0,1";
    const tenths = (units + SCALE / 20n) / (SCALE / 10n);
    return `${(tenths / 10n).toLocaleString("vi-VN")},${tenths % 10n}`;
  }
  return formatMeasure(`${units / SCALE}.${(units % SCALE).toString().padStart(4, "0")}`);
}
export function fundedQuantity(income: bigint, config: PricedGoalConfig, compact = false) {
  return displayQuantityUnits(fundedQuantityUnits(income, config), compact);
}

export function remainingQuantity(income: bigint, config: PricedGoalConfig, compact = false) {
  const target = measureUnits(config.quantity), funded = fundedQuantityUnits(income, config);
  const units = target > funded ? target - funded : 0n;
  return displayQuantityUnits(units, compact);
}

// Preserve the existing length API while both unit-based goals share exact progress math.
export const fundedLength = fundedQuantity;
export const remainingLength = remainingQuantity;

import { normalize } from "./domain";
export const keywordKey = (value: string) => normalize(value).replace(/ /g, "");
export class FundKeywordError extends Error {
  constructor(public fieldErrors: Record<string, string[]>) {
    super(Object.values(fieldErrors).flat().join("\n"));
    this.name = "FundKeywordError";
  }
}
type ExistingFund = { id: string; code: string; name: string; keywords: string[] };
/** Validate using exactly the same case/accent/spacing equivalence as matching. */
export function validateFundKeywords(
  code: string,
  input: string,
  funds: ExistingFund[],
  editingId?: string,
) {
  const own = [
    { value: code, key: keywordKey(code), location: "Mã thiện pháp" },
    ...input.split(/\r?\n/).flatMap((line, index) => line.split(/[;,]/).filter(v => v.trim()).map(value => ({ value: value.trim(), key: keywordKey(value), location: `Từ khóa dòng ${index + 1}` }))),
  ];
  const errors: string[] = [];
  const seen = new Map<string, typeof own[number]>();
  for (const term of own) {
    if (!term.key) { errors.push(`${term.location} “${term.value}” không chứa chữ hoặc số hợp lệ.`); continue; }
    const duplicate = seen.get(term.key);
    if (duplicate) errors.push(`${term.location} “${term.value}” trùng ${duplicate.location.toLowerCase()} “${duplicate.value}” trong biểu mẫu này.`);
    else seen.set(term.key, term);
    for (const fund of funds) {
      if (fund.id === editingId) continue;
      const matches = [
        { value: fund.code, kind: "mã" },
        ...fund.keywords.map(value => ({ value, kind: "từ khóa" })),
      ].filter(other => keywordKey(other.value) === term.key);
      for (const match of matches) errors.push(`${term.location} “${term.value}” trùng ${match.kind} “${match.value}” của thiện pháp ${fund.code} — ${fund.name}.`);
    }
  }
  if (errors.length) throw new FundKeywordError({
    code: errors.filter(message => message.startsWith("Mã thiện pháp")),
    keywords: errors.filter(message => !message.startsWith("Mã thiện pháp")),
  });
  return own.slice(1).map(term => normalize(term.value));
}


/** The public payment hint must always identify this same fund. */
export function resolveTransferKeyword(code:string,keywords:string[],requested:string|null|undefined,previous?:string|null){
 const candidate=requested===undefined?previous:requested;
 if(!candidate?.trim()||keywordKey(candidate)===keywordKey(code))return null;
 const match=keywords.find(value=>keywordKey(value)===keywordKey(candidate));
 if(match)return match;
 // Older forms may omit the field. Removing an old alias safely restores the code.
 if(requested===undefined)return null;
 throw new FundKeywordError({transferKeyword:["Chọn mã chính hoặc một từ khóa mở rộng của thiện pháp này."]});
}

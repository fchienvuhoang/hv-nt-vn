import type {publicFund,PublicFundDTO} from "./public-data";
export const PUBLIC_PAGE_SIZE=100;
export function publicFundDTO(fund:NonNullable<Awaited<ReturnType<typeof publicFund>>>):PublicFundDTO {
  const {id,cutover,...result}=fund;void id;void cutover;return result;
}

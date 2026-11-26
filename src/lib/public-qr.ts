export const PUBLIC_QR_CODES={
 '0572':{account:'0572',owner:'HO THI TRA MY',label:'0572 – My',src:'/payments/qr-0572.png',width:518,height:666},
 '0856':{account:'0856',owner:'TRAN THU TRAM',label:'0856 – Trâm',src:'/payments/qr-0856.png',width:548,height:698},
} as const;
export function publicQr(account?:string|null){
 return account==='0572'||account==='0856'?PUBLIC_QR_CODES[account]:null;
}

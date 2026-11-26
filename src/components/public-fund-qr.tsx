import Image from 'next/image';
import {Download} from 'lucide-react';
import {publicQr} from '@/lib/public-qr';
import styles from './public-fund-qr.module.css';

export function PublicFundQr({account,code}:{account?:string|null;code:string}){
 const qr=publicQr(account);
 if(!qr)return null;
 return <section className={styles.card} aria-label="Mã QR hùn phước">
  <div className={styles.details}>
   <span className={styles.eyebrow}>HÙN PHƯỚC THIỆN PHÁP</span>
   <h2>Quét QR hùn phước</h2>
   <p className={styles.owner}>{qr.owner}</p>
   <p>Tài khoản <strong>{qr.account}</strong></p>
   <p className={styles.note}>Nhập nội dung chuyển khoản:<br/><code>{code} TÊN SĐT</code></p>
   <small>Sau khi quét, kiểm tra người nhận và thay TÊN, SĐT bằng thông tin của thí chủ.</small>
   <a className="button subtle small" href={qr.src} download={`QR-${qr.account}.png`}><Download size={15} aria-hidden="true"/> Tải mã QR</a>
  </div>
  <a className={styles.imageLink} href={qr.src} target="_blank" rel="noopener noreferrer" aria-label={`Mở mã QR ${qr.account} kích thước gốc`}>
   <Image className={styles.image} src={qr.src} width={qr.width} height={qr.height} alt={`Mã QR chuyển khoản ${qr.owner}, tài khoản ${qr.account}`} loading="eager" unoptimized/>
  </a>
 </section>;
}

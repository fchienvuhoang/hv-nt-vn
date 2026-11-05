import type { ReactNode } from "react";
import styles from "./public-devotional-banner.module.css";

export function PublicDevotionalBanner({ children }: { children: ReactNode }) {
  return <section className={styles.banner}>
    <div className={styles.copy}>{children}<blockquote className={styles.blessing}><p><span>“Người trí thích bố thí,<br />Đời sau, được hưởng lạc.”</span></p><cite>Kinh Pháp Cú, trích kệ 177 · HT. Thích Minh Châu dịch</cite></blockquote></div>
  </section>;
}

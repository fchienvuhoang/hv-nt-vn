import type { ReactNode } from "react";
import styles from "./public-devotional-banner.module.css";

export function PublicDevotionalBanner({ children }: { children: ReactNode }) {
  return <section className={styles.banner}>
    <div className={styles.copy}>{children}<blockquote className={styles.blessing}><p>“Người trí thích bố thí,<br />Đời sau, được hưởng lạc.”</p><cite><a href="https://phatgiaoaluoi.com/news/Tu-hoc/Kinh-Phap-Cu-Ban-dich-cua-HT-Thich-Minh-Chau-5554/" target="_blank" rel="noopener noreferrer">Kinh Pháp Cú, trích kệ 177</a> · HT. Thích Minh Châu dịch</cite></blockquote></div>
  </section>;
}

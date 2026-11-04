import Image from "next/image";
import {LoadingIndicator} from "@/components/loading-indicator";

export default function Loading(){
  return <main className="app-startup-loading" aria-label="Đang mở ứng dụng">
    <Image src="/pwa/icon-192.png" width={80} height={80} alt="" priority unoptimized/>
    <strong>Học viện nguyên thủy Việt Nam</strong>
    <LoadingIndicator label="Đang mở ứng dụng…" compact/>
  </main>;
}

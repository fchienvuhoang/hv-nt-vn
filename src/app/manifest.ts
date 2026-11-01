import type {MetadataRoute} from "next";
export default function manifest():MetadataRoute.Manifest {
  return {id:"/",name:"Học viện nguyên thủy Việt Nam",short_name:"Hùn phước",lang:"vi",description:"Quản trị và theo dõi hùn phước thiện pháp",start_url:"/admin",scope:"/",display:"standalone",background_color:"#faf7f1",theme_color:"#803345",icons:[{src:"/pwa/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"/pwa/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"}]};
}

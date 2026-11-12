import {notFound} from "next/navigation";
import {PublicRecognition} from "@/components/public-recognition";
export const metadata={title:"Danh sách phương danh"};
export default async function RecognitionPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;if(!/^[a-z0-9-]{1,100}$/.test(slug))notFound();
 return <PublicRecognition slug={slug}/>;
}

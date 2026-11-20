"use client";
import {useEffect} from "react";
export function RegisterWorker(){
 useEffect(()=>{
  if(!("serviceWorker" in navigator)||process.env.NEXT_PUBLIC_DIGIOPS!=="1")return;
  const base=process.env.NEXT_PUBLIC_BASE_PATH||"";
  void navigator.serviceWorker.register(base+"/sw.js").catch(()=>{ /* The online app remains available. */ });
 },[]);
 return null;
}

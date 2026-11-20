"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
type Photo={id:string;createdAt:string};
type Requester=<T>(path:string,method?:string,data?:unknown,csrf?:string)=>Promise<T>;
async function encode(file:File){
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>12*1024*1024)throw Error("Choose a JPEG, PNG or WebP under 12 MiB.");
 const bitmap=await createImageBitmap(file);
 try{
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx)throw Error("Image processing unavailable.");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.72,.6,.45]){
   const data=canvas.toDataURL("image/jpeg",quality).split(",")[1];
   if(data&&data.length<=262144)return data;
  }
  throw Error("Image could not be compressed; choose a smaller file.");
 }finally{bitmap.close();}
}
export function ProgressPhotos({request,csrf,online}:{request:Requester;csrf:string;online:boolean}){
 const [photos,Photos]=useState<Photo[]>([]),[views,Views]=useState<{id:string;jpeg:string}[]>([]),[busy,Busy]=useState(false),[notice,Notice]=useState("");
 useEffect(()=>{
  if(!online)return;
  let live=true;
  request<{photos:Photo[]}>("/photos").then(x=>{if(live)Photos(x.photos);}).catch(()=>{if(live)Notice("Could not load your photo list.");});
  return()=>{live=false;};
 },[request,online]);
 async function run(fn:()=>Promise<void>){Busy(true);Notice("");try{await fn();}catch(e){Notice(e instanceof Error?e.message:"Photo request failed.");}finally{Busy(false);}}
 return <section className="grid gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4 sm:col-span-2 sm:p-6">
  <h2 className="text-xl font-black">Private progress photos</h2>
  <p className="text-sm text-neutral-400">Photos are stored separately from training JSON export. Uploads are resized in your browser. Up to 12 photos.</p>
  <label className="grid gap-1 text-sm">Add a photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={!online||busy||photos.length>=12} onChange={e=>{
   const file=e.currentTarget.files?.[0];e.currentTarget.value="";
   if(file)void run(async()=>{const jpeg=await encode(file);const photo=await request<Photo>("/photos","POST",{jpeg},csrf);Photos(p=>[photo,...p]);Notice("Photo saved.");});
  }}/></label>
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <ul className="grid gap-2 sm:grid-cols-2">{photos.map(photo=><li key={photo.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-2">
   <span>{new Date(photo.createdAt).toLocaleDateString()}</span>
   <Button variant="outline" disabled={!online||busy} onClick={()=>void run(async()=>{const x=await request<{jpeg:string}>("/photos/"+photo.id);Views(v=>[...v.filter(y=>y.id!==photo.id),{id:photo.id,jpeg:x.jpeg}].slice(-2));})}>View</Button>
   <Button variant="ghost" disabled={!online||busy} onClick={()=>{if(window.confirm("Delete this progress photo?"))void run(async()=>{await request("/photos/"+photo.id,"DELETE",undefined,csrf);Photos(p=>p.filter(x=>x.id!==photo.id));Views(v=>v.filter(x=>x.id!==photo.id));});}}>Delete</Button>
  </li>)}</ul>
  {!!views.length&&<div className="grid grid-cols-2 gap-2">{views.map(x=><figure key={x.id}>
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img alt="Private training progress" className="w-full rounded-lg" src={"data:image/jpeg;base64,"+x.jpeg}/>
   <figcaption>{new Date(photos.find(p=>p.id===x.id)?.createdAt??0).toLocaleDateString()}</figcaption>
  </figure>)}</div>}
 </section>;
}

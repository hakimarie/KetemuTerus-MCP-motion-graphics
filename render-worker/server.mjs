import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
const PORT=Number(process.env.PORT||8080), TOKEN=process.env.RENDER_WORKER_TOKEN||"";
function auth(req){const h=req.headers.authorization||"", a=Buffer.from(h.startsWith("Bearer ")?h.slice(7):""), b=Buffer.from(TOKEN);return b.length>=32&&a.length===b.length&&timingSafeEqual(a,b);}
function send(res,status,obj){res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(obj));}
async function body(req){let s="";for await(const c of req){s+=c;if(s.length>32000)throw Error("Request too large");}return JSON.parse(s||"{}");}
async function download(url,file){const u=new URL(url);if(u.protocol!=="https:")throw Error("HTTPS asset URLs only");const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error("Asset download failed: HTTP "+r.status);const b=Buffer.from(await r.arrayBuffer());if(!b.length||b.length>500*1024*1024)throw Error("Invalid asset size");await fs.writeFile(file,b);}
function run(args){return new Promise((ok,no)=>{const p=spawn("ffmpeg",args,{stdio:["ignore","ignore","pipe"]});let e="";p.stderr.on("data",x=>{e+=x.toString();if(e.length>10000)e=e.slice(-10000);});p.on("error",no);p.on("close",c=>c===0?ok():no(Error("FFmpeg exit "+c+": "+e)));});}
const server=http.createServer(async(req,res)=>{
 if(req.method==="GET"&&req.url==="/health")return send(res,200,{ok:true});
 if(req.method!=="POST"||req.url!=="/render")return send(res,404,{error:"Not found"});
 if(!auth(req))return send(res,401,{error:"Unauthorized"});
 let dir;
 try{
  const b=await body(req);
  if(!Array.isArray(b.clips)||b.clips.length<2||b.clips.length>12)return send(res,400,{error:"Provide 2-12 clip URLs"});
  if(!["9:16","16:9"].includes(b.aspectRatio))return send(res,400,{error:"Invalid aspect ratio"});
  dir=await fs.mkdtemp(path.join(os.tmpdir(),"kt-motion-"));const inputs=[];
  for(let i=0;i<b.clips.length;i++){const f=path.join(dir,"clip-"+i+".mp4");await download(b.clips[i],f);inputs.push(f);}
  let voice;
  if(b.voiceoverUrl){voice=path.join(dir,"voiceover");await download(b.voiceoverUrl,voice);}
  const out=path.join(dir,"final.mp4"), w=b.aspectRatio==="9:16"?1080:1920,h=b.aspectRatio==="9:16"?1920:1080,args=[];
  for(const f of inputs)args.push("-i",f);
  if(voice)args.push("-i",voice);
  const filters=inputs.map((_,i)=>`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30,format=yuv420p[v${i}]`);
  filters.push(inputs.map((_,i)=>`[v${i}]`).join("")+`concat=n=${inputs.length}:v=1:a=0[vout]`);
  args.push("-filter_complex",filters.join(";"),"-map","[vout]");
  if(voice)args.push("-map",`${inputs.length}:a:0`,"-af","apad");
  else args.push("-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000","-map",`${inputs.length}:a:0`,"-shortest");
  args.push("-c:v","libx264","-preset","veryfast","-crf","20","-c:a","aac","-b:a","192k","-movflags","+faststart","-shortest",out);
  await run(args);const result=await fs.readFile(out);
  res.writeHead(200,{"content-type":"video/mp4","content-length":result.length,"x-render-id":randomUUID()});res.end(result);
 }catch(e){send(res,500,{error:e instanceof Error?e.message:"Render failed"});}
 finally{if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});}
});
server.listen(PORT,"0.0.0.0",()=>process.stdout.write("Render worker listening on "+PORT+"\n"));

import { put } from '@vercel/blob';
import { requireKey, blobAuth } from './_auth.js';

const REGISTRY={
 karibrk:{path:'/denik-media/refs/portraits/karibrk.webp',note:'adult male hobbit necromancer; preserve exact face and hobbit proportions'},
 elie:{path:'/denik-media/refs/portraits/elie.webp',note:'9-year-old girl; preserve exact face and age'},
 tina:{path:'/denik-media/refs/portraits/tina.webp',note:'adult woman rogue; preserve exact face'},
 sandor:{path:'/denik-media/refs/portraits/sandor.webp',note:'adult half-orc fighter; preserve exact face and half-orc traits'},
 mer:{path:'/denik-media/refs/portraits/mer.webp',note:'adult grave cleric; preserve exact face'},
 ula:{path:'/denik-media/refs/portraits/ula.webp',note:'girl appearing about 14; preserve exact face and apparent age'},
 dedek:{path:'/denik-media/refs/portraits/dedek.webp',note:'boy appearing about 11; preserve exact face and apparent age'}
};
function abs(req,p){const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];return `${proto}://${req.headers.host}${p}`;}
function slug(s){return String(s||'fragment').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'fragment';}
function parseImage(message){
 const arr=message?.images;if(Array.isArray(arr)){for(const im of arr){const u=im?.image_url?.url||im?.url;if(u)return u;}}
 return null;
}
async function toBytes(src){
 if(src.startsWith('data:')){const m=src.match(/^data:([^;]+);base64,(.+)$/s);if(!m)throw new Error('Bad data URL');return {type:m[1],bytes:Buffer.from(m[2],'base64')};}
 const r=await fetch(src);if(!r.ok)throw new Error(`Image fetch ${r.status}`);return {type:r.headers.get('content-type')||'image/png',bytes:Buffer.from(await r.arrayBuffer())};
}
export default async function handler(req,res){
 if(!requireKey(req,res))return;if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
 const id=String(req.body?.id||'fragment'),day=Number(req.body?.day||0),text=String(req.body?.text||'').trim();
 if(!text)return res.status(400).json({ok:false,error:'Missing fragment text'});
 const chars=Array.isArray(req.body?.characters)?req.body.characters.filter(x=>REGISTRY[x]):[];
 const refs=chars.map(c=>({id:c,url:abs(req,REGISTRY[c].path),note:REGISTRY[c].note}));
 const model=process.env.BANDD_IMAGE_MODEL||'google/gemini-3.1-flash-image-preview';
 const apiKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
 if(!apiKey)return res.status(503).json({ok:false,error:'AI Gateway is not configured'});
 const identity=refs.length?`REFERENCE FACES ARE CANON. Preserve the exact identity, facial geometry, age and species of every referenced character. Do not redesign their faces. References: ${refs.map(r=>r.id+': '+r.note).join('; ')}.`:'No canonical face reference was supplied; avoid close portrait framing of unreferenced named characters.';
 const prompt=`Create one cinematic dark-fantasy illustration for a Dungeons & Dragons / Forgotten Realms campaign memory fragment. ${identity}\nScene source of truth: ${text}\nDay: ${day}.\nStyle: grounded cinematic realism, natural medieval materials, subtle painterly finish, emotionally truthful, no glamour posing, no modern objects. Keep hobbits visibly hobbit-sized. Do not add text, captions, logos or UI. Do not invent extra named characters. Landscape 16:9 unless the scene clearly needs a tighter composition.`;
 const content=[{type:'text',text:prompt},...refs.map(r=>({type:'image_url',image_url:{url:r.url,detail:'high'}}))];
 try{
  const g=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content}],modalities:['text','image'],stream:false})});
  const raw=await g.text();let j={};try{j=JSON.parse(raw)}catch{j={raw}};if(!g.ok)throw new Error(`AI Gateway ${g.status}: ${raw.slice(0,500)}`);
  const src=parseImage(j?.choices?.[0]?.message);if(!src)throw new Error('Model returned no image. Response keys: '+Object.keys(j?.choices?.[0]?.message||{}).join(','));
  const im=await toBytes(src);const ext=im.type.includes('webp')?'webp':im.type.includes('jpeg')?'jpg':'png';
  const path=`art/fragments/day-${String(day).padStart(3,'0')}/${slug(id)}-${Date.now()}.${ext}`;
  const blob=await put(path,im.bytes,{access:'public',contentType:im.type,addRandomSuffix:false,...blobAuth()});
  return res.status(200).json({ok:true,url:blob.url,pathname:blob.pathname,model,characters:chars,references:refs.map(r=>r.id),createdAt:new Date().toISOString()});
 }catch(e){return res.status(500).json({ok:false,error:String(e.message||e),model,references:refs.map(r=>r.id)});}
}

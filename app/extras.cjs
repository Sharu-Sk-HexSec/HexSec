const fs=require('node:fs/promises');
const path=require('node:path');
function normalizeTitle(s){return String(s||'').replace(/\s*\((?:from|feat\.?|ft\.?)[^)]*\)/gi,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim().toLowerCase();}
function createExtras({app,safeStorage,fetchImpl=fetch}){
 let config;
 const file=()=>path.join(app.getPath('userData'),'hexsec-preferences.enc');
 async function read(){if(config)return config;try{config=JSON.parse(safeStorage.decryptString(await fs.readFile(file())));}catch(e){if(e.code!=='ENOENT')throw Error('Cannot read saved translation settings on this Windows account.');config={translationUrl:'',apiKey:''};}return config;}
 async function json(url,options={}){const r=await fetchImpl(url,{...options,signal:AbortSignal.timeout(20000)});if(r.status===404)return null;if(!r.ok)throw Error(`Service returned ${r.status}. Check the connection or provider setup.`);const text=await r.text();if(text.length>4000000)throw Error('Provider response is too large.');return JSON.parse(text);}
 return async function(action,data={}){
  if(action==='settings'){const c=await read();return {translationUrl:c.translationUrl,hasKey:!!c.apiKey};}
  if(action==='saveSettings'){
   const c=await read();const value=String(data.translationUrl||'').trim();if(value){const u=new URL(value);const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);if((u.protocol!=='https:'&&!(local&&u.protocol==='http:'))||u.username||u.password||u.search||u.hash)throw Error('Use an HTTPS translation URL, or HTTP on localhost.');}
   config={translationUrl:value,apiKey:data.clearKey?'':String(data.apiKey||c.apiKey||'').slice(0,4096)};
   if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');await fs.mkdir(path.dirname(file()),{recursive:true});await fs.writeFile(file(),safeStorage.encryptString(JSON.stringify(config)));return {translationUrl:config.translationUrl,hasKey:!!config.apiKey};
  }
  if(action==='lyrics'){
   const title=String(data.title||'').trim().slice(0,200),artist=String(data.artist||'').split(',')[0].replace(/\s*-\s*Topic$/,'').trim().slice(0,150);if(!title)return {matches:[]};
   const u=new URL('https://lrclib.net/api/search');u.searchParams.set('track_name',title.replace(/\s*\(From[^)]*\)/gi,'').trim());if(artist)u.searchParams.set('artist_name',artist);
   let rows=await json(u,{headers:{'User-Agent':'HexSec/0.4 (personal desktop music player)'}});
   if(Array.isArray(rows)&&!rows.length&&artist){u.searchParams.delete('artist_name');rows=await json(u,{headers:{'User-Agent':'HexSec/0.4 (personal desktop music player)'}});}
   const matches=(Array.isArray(rows)?rows:[]).slice(0,20).map(r=>({id:r.id,title:r.trackName,artist:r.artistName,album:r.albumName,duration:r.duration,instrumental:!!r.instrumental,plainLyrics:r.plainLyrics||'',syncedLyrics:r.syncedLyrics||'',exact:normalizeTitle(r.trackName)===normalizeTitle(title)&&(!artist||normalizeTitle(r.artistName).includes(normalizeTitle(artist)))&&(!Number(data.duration)||Math.abs(Number(r.duration)-Number(data.duration))<6)}));
   matches.sort((a,b)=>Number(b.exact)-Number(a.exact));return {matches,provider:'LRCLIB'};
  }
  if(action==='translate'){
   const c=await read();if(!c.translationUrl)throw Error('Add a LibreTranslate server in Settings to translate lyrics.');const text=String(data.text||'');if(!text.trim())throw Error('Load lyrics first.');if(text.length>20000)throw Error('These lyrics exceed the translation length limit.');const target=String(data.target||'en');if(!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(target))throw Error('Choose a valid target language.');const u=new URL(c.translationUrl);if(!u.pathname.endsWith('/translate'))u.pathname=u.pathname.replace(/\/$/,'')+'/translate';
   const payload={q:text,source:'auto',target,format:'text'};if(c.apiKey)payload.api_key=c.apiKey;
   const result=await json(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!result||typeof result.translatedText!=='string')throw Error('The translation provider did not return translated lyrics.');return {text:result.translatedText};
  }
  throw Error('Unsupported player request.');
 };
}
module.exports={createExtras,normalizeTitle};

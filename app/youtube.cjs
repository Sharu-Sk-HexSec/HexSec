const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const SCOPE='https://www.googleapis.com/auth/youtube';
function createYouTubeService({app,safeStorage,shell,dialog,fetchImpl=fetch,workerImpl}){
 const filename=()=>path.join(app.getPath('userData'),'youtube-account.enc');
 let state=null,pending=null,authError='',generation=0,busy=false;const children=new Set();
 async function read(){if(state)return state;try{const raw=await fs.readFile(filename());state=JSON.parse(safeStorage.decryptString(raw));}catch(e){if(e.code!=='ENOENT')throw Error('Could not read saved Google connection. Disconnect and reconnect on this Windows account.');state={config:null,token:null,library:{}};}return state;}
 async function write(){if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable. Google login was not saved.');await fs.mkdir(path.dirname(filename()),{recursive:true});const tmp=filename()+'.tmp';await fs.writeFile(tmp,safeStorage.encryptString(JSON.stringify(state)));await fs.rename(tmp,filename());}
 function publicState(){return {configured:!!state?.config,connected:!!state?.token,pending:!!pending,error:authError,library:state?.library||{},profile:state?.profile||null};}
 function cancel(){if(pending){clearTimeout(pending.timer);pending.server.close();pending=null;}}
 function runWorker(payload){if(workerImpl)return workerImpl(payload);return new Promise((resolve,reject)=>{
  const python=path.join(__dirname,'..','python314','python.exe');const child=spawn(python,['-I',path.join(__dirname,'youtube_worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child);let output='',size=0,settled=false;
  const finish=(err,result)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(result);};
  const timer=setTimeout(()=>{child.kill();finish(Error('YouTube sync timed out. Your previous collection is still saved. Try syncing again.'));},180000);
  child.stdout.on('data',data=>{size+=data.length;if(size>32*1024*1024){child.kill();finish(Error('Library response is too large.'));}else output+=data.toString('utf8');});
  child.stderr.on('data',()=>{});child.on('error',()=>finish(Error('The bundled YouTube helper could not start. Extract the full app folder again.')));
  child.on('close',()=>{children.delete(child);try{const result=JSON.parse(output);if(!result.ok)throw Error(result.error||'YouTube sync failed.');finish(null,result);}catch(e){finish(Error(e.message==='Unexpected end of JSON input'?'The YouTube helper did not return a response.':e.message));}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(payload));
 });}
 async function connect(){await read();if(!state.config)throw Error('Import your Google Desktop OAuth client JSON first.');if(busy)throw Error('Wait for the current sync to finish before connecting.');cancel();authError='';const attempt=++generation;
  const nonce=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
  const server=http.createServer(async(req,res)=>{
   res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   const u=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'||u.pathname!=='/oauth/callback'){res.writeHead(404);res.end('Not found');return;}
   if(u.searchParams.get('state')!==nonce){res.writeHead(400);res.end('Invalid login response. Return to Aural and try again.');return;}
   if(!pending||pending.attempt!==attempt){res.writeHead(410);res.end('This login request has expired.');return;}
   const code=u.searchParams.get('code');if(!code||u.searchParams.has('error')){authError='Google login was cancelled or denied. You can reconnect when ready.';res.end(authError);cancel();return;}
   if(pending.exchanging){res.writeHead(409);res.end('Login is already being processed.');return;}pending.exchanging=true;
   try{const body=new URLSearchParams({client_id:state.config.clientId,client_secret:state.config.clientSecret,code,code_verifier:verifier,redirect_uri:pending.redirect,grant_type:'authorization_code'});
    const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',body,signal:AbortSignal.timeout(25000)});const t=await r.json();
    if(!r.ok||!t.access_token||!t.refresh_token)throw Error('Google did not complete login. Check the Desktop OAuth client setup and try again.');
    if(attempt!==generation)throw Error('Login cancelled.');
    state.token={access_token:t.access_token,refresh_token:t.refresh_token,token_type:t.token_type||'Bearer',scope:t.scope||SCOPE,expires_in:Number(t.expires_in)||3600,expires_at:Math.floor(Date.now()/1000)+(Number(t.expires_in)||3600)};state.library={};await write();res.end('Connected to Aural. You can close this tab and return to the app.');
   }catch(e){authError=e.message||'Google login failed.';res.writeHead(400);res.end(authError);}finally{cancel();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const redirect=`http://127.0.0.1:${server.address().port}/oauth/callback`;
  pending={server,redirect,attempt,timer:setTimeout(()=>{authError='Login expired. Click Connect Google to start again.';cancel();},300000)};
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v]of Object.entries({client_id:state.config.clientId,redirect_uri:redirect,response_type:'code',scope:SCOPE,access_type:'offline',prompt:'consent select_account',state:nonce,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}))url.searchParams.set(k,v);
  try{await shell.openExternal(url.href);}catch{cancel();throw Error('Could not open your browser. Please try Connect Google again.');}return publicState();
 }
 async function action(name,data={}){
  if(name==='disconnect'){if(busy)throw Error('Wait for the current library sync to finish, then disconnect.');generation++;cancel();state={config:null,token:null,library:{}};authError='';await fs.rm(filename(),{force:true});return publicState();}
  await read();
  if(name==='status')return publicState();
  if(name==='cancel'){generation++;cancel();authError='';return publicState();}
  if(name==='setup'){
   if(busy)throw Error('Wait for the current sync to finish.');const selected=await dialog.showOpenDialog({title:'Import Google Desktop OAuth client JSON',properties:['openFile'],filters:[{name:'Google OAuth client',extensions:['json']}]});if(selected.canceled)return publicState();
   const stat=await fs.stat(selected.filePaths[0]);if(stat.size>65536)throw Error('This file is too large to be an OAuth client JSON.');let installed;try{installed=JSON.parse(await fs.readFile(selected.filePaths[0],'utf8')).installed;}catch{throw Error('Choose the OAuth client JSON downloaded from Google Cloud.');}
   if(!installed||!String(installed.client_id||'').endsWith('.apps.googleusercontent.com')||typeof installed.client_secret!=='string'||!installed.client_secret)throw Error('Use a Desktop app OAuth client JSON, not a Web or TV client.');
   generation++;cancel();state={config:{clientId:installed.client_id,clientSecret:installed.client_secret},token:null,library:{}};authError='';await write();return publicState();
  }
  if(name==='connect')return connect();
  if(name==='help'){await shell.openExternal('https://console.cloud.google.com/auth/clients');return publicState();}
  if(!['library','collection','profile'].includes(name))throw Error('Unsupported YouTube action.');
  if(!state.token)throw Error('Connect your Google account first.');if(busy)throw Error('Another sync is running. Please wait.');
  const kinds=['playlists','liked','albums','songs'];if(name==='library'&&!kinds.includes(data.kind))throw Error('Unsupported library section.');
  if(name==='collection'&&(!['playlist','album'].includes(data.type)||!/^[-\w]{1,200}$/.test(data.id||'')))throw Error('Invalid YouTube collection.');
  busy=true;const currentGeneration=generation;try{const result=await runWorker({action:name,...data,config:state.config,token:state.token});if(currentGeneration!==generation)throw Error('Connection changed. Please sync again.');if(result.token)state.token=result.token;if(name==='profile')state.profile=result.profile;if(name==='library')state.library[data.kind]={items:result.items,source:result.source||'youtube-music',notice:result.notice||'',syncedAt:new Date().toISOString()};await write();return ['library','profile'].includes(name)?publicState():{items:result.items};}finally{busy=false;}
 }
 return {action,close(){generation++;cancel();for(const child of children)child.kill();}};
}
module.exports={createYouTubeService};

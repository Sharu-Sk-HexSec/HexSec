const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let win;
// Keep the existing profile so an upgrade retains Google login and local library.
app.setPath('userData',path.join(app.getPath('appData'),'Aural'));
app.setName('HexSec');
const extras=require('./extras.cjs').createExtras({app,safeStorage});
ipcMain.handle('extras',(_,action,data)=>extras(action,data));
const youtube=require('./youtube.cjs').createYouTubeService({app,safeStorage,shell,dialog});
let videoWindow,videoServer;
async function showYouTubePlayer(videoId){
 if(!/^[\w-]{11}$/.test(videoId))throw Error('Invalid YouTube video.');
 if(!videoServer){videoServer=require('node:http').createServer((req,res)=>{const match=/^\/player\/([\w-]{11})$/.exec(req.url);if(!match){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-src https://www.youtube.com; style-src 'unsafe-inline'");res.end(`<!doctype html><html><head><title>HexSec · YouTube player</title><style>body{margin:0;background:#111;color:#eee;font:14px Segoe UI}iframe{width:100vw;height:calc(100vh - 50px);border:0}p{margin:12px 18px}</style></head><body><iframe src="https://www.youtube.com/embed/${match[1]}?autoplay=1" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen title="YouTube music player" referrerpolicy="strict-origin-when-cross-origin"></iframe><p>Use the YouTube controls to play or pause. Some videos may require playback on YouTube.</p></body></html>`);});await new Promise((resolve,reject)=>{videoServer.once('error',reject);videoServer.listen(0,'127.0.0.1',resolve);});}
 if(!videoWindow||videoWindow.isDestroyed()){videoWindow=new BrowserWindow({width:960,height:650,parent:win,title:'HexSec · YouTube player',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});videoWindow.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(['www.youtube.com','music.youtube.com'].includes(u.hostname)&&u.protocol==='https:')shell.openExternal(u.href);}catch{}return {action:'deny'};});videoWindow.webContents.on('will-navigate',e=>e.preventDefault());}
 await videoWindow.loadURL(`http://127.0.0.1:${videoServer.address().port}/player/${videoId}`);videoWindow.show();videoWindow.focus();return {opened:true};
}
ipcMain.handle('youtube',(_,action,data)=>action==='play'?showYouTubePlayer(String(data?.videoId||'')):youtube.action(action,data));
app.on('before-quit',()=>{youtube.close();videoServer?.close();});
const safeUrl=(value)=>{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use an HTTP or HTTPS server URL.');return u;};
ipcMain.handle('api',async(_,base,route,query)=>{
  if(!['search','stream','browse','qualities','related'].includes(route))throw Error('Unsupported request.');
  if(base==='builtin'){
    if(route==='related'){const id=String(query);if(!/^[\w-]{1,64}$/.test(id))throw Error('Choose an online source track first.');let timer;try{return await Promise.race([require('./provider.cjs').relatedSongs(id),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Song radio timed out. Try again.')),20000);})]);}finally{clearTimeout(timer);}}
    if(route==='qualities'){const id=String(query);if(!/^[\w-]{1,64}$/.test(id))throw Error('Invalid song.');return require('./provider.cjs').audioOptions(id);}
    if(route==='browse'){
      const {browse}=require('./provider.cjs');
      const q=String(query?.query||'Tamil').trim().slice(0,250),page=Math.min(1000,Math.max(1,Math.trunc(Number(query?.page)||1)));
      let timer;try{return await Promise.race([browse(q,page,12),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Music source timed out. Use Retry to try again.')),20000);})]);}finally{clearTimeout(timer);}
    }
    const {Echo}=require('./provider.cjs');
    const u=new URL('http://localhost/'+route);u.searchParams.set(route==='search'?'q':'id',String(query).slice(0,250));
    let timer;try{const r=await Promise.race([Echo.request(u.href),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Music source timed out. Try again or configure another server.')),20000);})]);const data=await r.json();if(!r.ok)throw Error(data.message||'Music source unavailable.');return data;}finally{clearTimeout(timer);}
  }
  if(route==='related')throw Error('Same vibe radio is available with the built-in music source.');
  const isSearch=route==='search'||route==='browse';
  const u=safeUrl(base);u.pathname=u.pathname.replace(/\/$/,'')+'/'+(isSearch?'search':'stream');u.search='';
  u.searchParams.set(isSearch?'q':'id',String(route==='browse'?query?.query:query).slice(0,250));
  const r=await fetch(u,{signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error(`Music source returned ${r.status}. Check your server in Settings.`);
  if(!(r.headers.get('content-type')||'').includes('json'))throw Error('This URL returned a webpage. Add your deployed Echo extension server in Settings.');
  const data=await r.json();return route==='qualities'?{streams:Array.isArray(data.streams)?data.streams:[data]}:data;
});
ipcMain.handle('import',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'Music',extensions:['mp3','m4a','wav','ogg','flac','aac']}]});return r.canceled?[]:r.filePaths.map(p=>({id:'local:'+p,title:path.basename(p,path.extname(p)),artist:'On this computer',localURL:pathToFileURL(p).href}));});
function create(){win=new BrowserWindow({width:1280,height:850,minWidth:900,minHeight:650,show:!process.argv.includes('--aural-qa'),backgroundColor:'#111410',title:'HexSec',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});if(process.argv.includes('--aural-qa'))win.webContents.setAudioMuted(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.loadFile('index.html');}
app.whenReady().then(create);app.on('window-all-closed',()=>app.quit());

const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{api:(base,route,q)=>ipcRenderer.invoke('api',base,route,q),importMusic:()=>ipcRenderer.invoke('import'),youtube:(action,data)=>ipcRenderer.invoke('youtube',action,data),extras:(action,data)=>ipcRenderer.invoke('extras',action,data)});

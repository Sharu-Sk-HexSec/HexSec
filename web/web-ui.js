document.documentElement.classList.add('web-player');
$('youtubeButton').hidden=true;$('settingsAccountButton').hidden=true;document.querySelector('.settingsAccount').hidden=true;
const webLocalNote=document.createElement('p');webLocalNote.className='hint';webLocalNote.textContent='Files stay on your device. Re-select imported files after refreshing this page. Favourites and playlists are stored in this browser.';document.querySelector('main > header').after(webLocalNote);
const settingsCopy=$('settings').querySelector('h3').nextElementSibling;settingsCopy.textContent='Online music connects through the browser-compatible Saavn source. An optional HTTPS Echo server must allow browser access (CORS).';
const webCredit=document.querySelector('#settings form > .hint:last-of-type');if(webCredit)webCredit.textContent='Independent web player. Not affiliated with Echo, Google or JioSaavn. Music availability depends on the source.';
document.querySelector('.translationSetup > p').textContent='Optional HTTPS LibreTranslate server with CORS support. Translation keys stay in memory until this page closes; they are not saved to browser storage.';
$('sourceLabel').textContent='Online music · Web';$('previous').onclick=()=>move(-1);
const webDownload=document.createElement('a');webDownload.href='https://github.com/Sharu-Sk-HexSec/HexSec/releases/latest';webDownload.textContent='Windows app ↗';webDownload.target='_blank';webDownload.rel='noopener noreferrer';webDownload.className='webDownload';document.querySelector('.sidebarBottom').append(webDownload);

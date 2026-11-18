export { Echo } from './src/modules/echo/echo.controller'
import { SearchService } from './src/modules/search/services/search.service'
import { createEchoTrack } from './src/modules/echo/echo.helpers'
const search = new SearchService()
import { SongService } from './src/modules/songs/services/song.service'
const songs = new SongService()
export async function relatedSongs(id: string) {
  let suggestions = []
  try { suggestions = await songs.getSongSuggestions({songId:id,limit:20}) } catch {}
  if (suggestions.length) return {tracks:suggestions.map(createEchoTrack),basis:'source-radio'}
  const seed = (await songs.getSongByIds({songIds:id}))[0]
  const artist = seed?.artists?.primary?.[0]?.name
  if (!artist) return {tracks:[]}
  const result = await search.searchSongs({query:artist,page:0,limit:20})
  return {tracks:result.results.filter(x=>x.id!==id).map(createEchoTrack),basis:'artist'}
}
export async function audioOptions(id: string) {
  const found = (await songs.getSongByIds({songIds:id})).find(x=>x.id===id)
  const variants = (found?.downloadUrl || []).filter(x=>/^https?:\/\//i.test(x.url)).map(x=>({url:x.url.replace(/^http:/,'https:'),quality:x.quality,format:'m4a',codec:'aac',lossless:false}))
  return {streams:variants}
}
export async function browse(query: string, page: number, limit: number) {
  const data = await search.searchSongs({ query, page, limit })
  return { tracks: data.results.map(createEchoTrack), total: data.total }
}

export async function moodSearch(query: string) {
 const data=await search.searchSongs({query,page:1,limit:30})
 return {tracks:data.results.map(s=>({...createEchoTrack(s),year:Number(s.year)||null,language:s.language,album:s.album?.name||''}))}
}

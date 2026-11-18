"""Single-request YouTube library reader. Credentials use stdin, never argv."""
import json
import sys
import traceback
import html
from pathlib import Path
from urllib.parse import urlparse
import requests
from ytmusicapi import YTMusic, OAuthCredentials

class UpstreamError(Exception):
    def __init__(self, status, host='', reason=''):
        self.status = status
        self.host = host
        self.reason = reason

class LibraryUnavailable(Exception):
    pass

class Session(requests.Session):
    def request(self, *args, **kwargs):
        kwargs.setdefault('timeout', 25)
        response = super().request(*args, **kwargs)
        if response.status_code >= 400:
            reason = ''
            try:
                data = response.json()
                err = data.get('error', {})
                candidate = err.get('status', '') if isinstance(err, dict) else err
                if isinstance(candidate, str) and len(candidate) < 80 and all(c.isalnum() or c == '_' for c in candidate):
                    reason = candidate
            except (ValueError, AttributeError):
                pass
            raise UpstreamError(response.status_code, urlparse(response.url).hostname or '', reason)
        return response

def artwork(item):
    images = item.get('thumbnails') or []
    return next((x.get('url') for x in reversed(images) if isinstance(x, dict) and str(x.get('url', '')).startswith('https://')), None)

def track(item):
    video_id = item.get('videoId')
    if not video_id:
        return None
    return {'id': 'yt:' + video_id, 'videoId': video_id, 'title': item.get('title') or 'Untitled',
            'artist': ', '.join(a.get('name', '') for a in item.get('artists') or []),
            'artworkURL': artwork(item), 'duration': item.get('duration_seconds'),
            'youtubeURL': 'https://music.youtube.com/watch?v=' + video_id}

def collection(item, kind):
    collection_id = item.get('browseId') if kind == 'album' else item.get('playlistId')
    if not collection_id:
        return None
    return {'id': collection_id, 'type': kind, 'title': item.get('title') or 'Untitled',
            'artworkURL': artwork(item), 'artist': ', '.join(a.get('name', '') for a in item.get('artists') or []),
            'count': item.get('count') or item.get('trackCount')}

def read_music(payload, yt):
    if payload['action'] == 'library':
        kind = payload['kind']
        if kind == 'playlists':
            items = [collection(x, 'playlist') for x in yt.get_library_playlists(limit=None)]
        elif kind == 'albums':
            items = [collection(x, 'album') for x in yt.get_library_albums(limit=None)]
        elif kind == 'liked':
            items = [track(x) for x in yt.get_liked_songs(limit=None).get('tracks', [])]
        elif kind == 'songs':
            items = [track(x) for x in yt.get_library_songs(limit=None)]
        else:
            raise ValueError('Unsupported section')
    elif payload['action'] == 'collection':
        result = yt.get_album(payload['id']) if payload['type'] == 'album' else yt.get_playlist(payload['id'], limit=None)
        items = [track(x) for x in result.get('tracks', [])]
    else:
        raise ValueError('Unsupported action')
    return [x for x in items if x]

def official_items(session, yt, endpoint, params):
    items, seen, page = [], set(), None
    while True:
        query = {**params, 'maxResults': 50}
        if page:
            query['pageToken'] = page
        response = session.get('https://www.googleapis.com/youtube/v3/' + endpoint,
                               params=query, headers={'Authorization': yt._token.as_auth()})
        data = response.json()
        items.extend(data.get('items', []))
        page = data.get('nextPageToken')
        if not page or page in seen:
            return items
        seen.add(page)

def official_track(item):
    snippet = item.get('snippet', {})
    video_id = snippet.get('resourceId', {}).get('videoId') or item.get('id')
    if not isinstance(video_id, str) or snippet.get('title') in ['Deleted video', 'Private video']:
        return None
    return track({'videoId': video_id, 'title': html.unescape(snippet.get('title', 'Untitled')),
                  'artists': [{'name': snippet.get('videoOwnerChannelTitle') or snippet.get('channelTitle', '')}],
                  'thumbnails': list(snippet.get('thumbnails', {}).values())})

def read_official(payload, yt, session):
    if payload['action'] == 'collection':
        if payload['type'] != 'playlist':
            raise LibraryUnavailable('Saved album sync is unavailable with this Google OAuth connection. Your account is connected; YouTube Music is rejecting the unofficial library reader.')
        rows = official_items(session, yt, 'playlistItems', {'part': 'snippet', 'playlistId': payload['id']})
        return [x for row in rows if (x := official_track(row))], 'Official YouTube playlist items.'
    kind = payload['kind']
    if kind == 'playlists':
        rows = official_items(session, yt, 'playlists', {'part': 'snippet,contentDetails', 'mine': 'true'})
        items = []
        for row in rows:
            snippet = row.get('snippet', {})
            items.append(collection({'playlistId': row['id'], 'title': html.unescape(snippet.get('title', 'Untitled')),
                                     'thumbnails': list(snippet.get('thumbnails', {}).values()),
                                     'trackCount': row.get('contentDetails', {}).get('itemCount')}, 'playlist'))
        return [x for x in items if x], 'Official YouTube connection: shows playlists you own. Other saved YouTube Music playlists may be missing.'
    if kind == 'liked':
        rows = official_items(session, yt, 'videos', {'part': 'snippet', 'myRating': 'like'})
        return [x for row in rows if (x := official_track(row))], 'Official YouTube connection: includes liked videos, not only music.'
    raise LibraryUnavailable('Saved albums and the full YouTube Music song library are unavailable through this OAuth connection. Playlists and liked videos use the official YouTube API; you do not need to reconnect.')

def execute(payload):
    config = payload['config']
    session = Session()
    credentials = OAuthCredentials(config['clientId'], config['clientSecret'], session=session)
    yt = YTMusic(auth=payload['token'], oauth_credentials=credentials, requests_session=session)
    if payload['action'] == 'profile':
        rows = official_items(session, yt, 'channels', {'part': 'snippet', 'mine': 'true'})
        snippet = rows[0].get('snippet', {}) if rows else {}
        photo = artwork({'thumbnails': list(snippet.get('thumbnails', {}).values())})
        return {'ok': True, 'profile': {'name': snippet.get('title') or 'Connected YouTube account', 'photo': photo, 'email': None, 'kind': 'YouTube channel'}, 'token': yt._token.as_dict()}
    source, notice = 'youtube-music', ''
    try:
        items = read_music(payload, yt)
    except UpstreamError as error:
        if error.status != 400 or error.host != 'music.youtube.com':
            raise
        items, notice = read_official(payload, yt, session)
        source = 'youtube-data-api'
    return {'ok': True, 'items': items, 'source': source, 'notice': notice, 'token': yt._token.as_dict()}

def main():
    try:
        payload = json.load(sys.stdin)
        result = execute(payload)
    except LibraryUnavailable as error:
        result = {'ok': False, 'error': str(error)}
    except UpstreamError as error:
        result = {'ok': False, 'error': 'YouTube rejected the library request (HTTP ' + str(error.status) + ', ' + error.host + ', ' + error.reason + '). Your Google login is saved; the reader may need a compatibility update.'}
    except requests.exceptions.RequestException:
        result = {'ok': False, 'error': 'Cannot reach YouTube Music. Check your connection and retry.'}
    except Exception as error:
        frame = traceback.extract_tb(error.__traceback__)[-1]
        diagnostic = type(error).__name__ + ' at ' + Path(frame.filename).name + ':' + str(frame.lineno)
        result = {'ok': False, 'error': 'YouTube library reader failed (' + diagnostic + '). Your login remains saved. No token or account contents are included in this diagnostic.'}
    print(json.dumps(result, ensure_ascii=True))

if __name__ == '__main__':
    main()

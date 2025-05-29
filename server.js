import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import qs from 'qs';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

const LASTFM_API_KEY = 'ea2e0dbd4e7e3e6489164642b18072f9';
const DEEZER_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const SHAZAM_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const GENIUS_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';

const SPOTIFY_CLIENT_ID = '85564f2ed8ca48d6824f5ec710801fb7';
const SPOTIFY_CLIENT_SECRET = 'd3491fbd8e0845b1a8e8be5d0f89c252';

let spotifyAccessToken = '';
let spotifyTokenExpiresAt = 0;

// Get Spotify access token (client credentials flow)
async function getSpotifyAccessToken() {
  if (spotifyAccessToken && Date.now() < spotifyTokenExpiresAt) {
    return spotifyAccessToken;
  }

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const body = qs.stringify({ grant_type: 'client_credentials' });

  const authHeader = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json();

    if (data.access_token) {
      spotifyAccessToken = data.access_token;
      spotifyTokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000; // Refresh 1 min early
      return spotifyAccessToken;
    } else {
      console.error('Spotify token error:', data);
      return null;
    }
  } catch (err) {
    console.error('Spotify token fetch failed:', err);
    return null;
  }
}

// Last.fm track search
app.get('/api/lastfm/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  try {
    const url = `http://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(q)}&api_key=${LASTFM_API_KEY}&format=json&limit=10`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Last.fm API error', details: error.message });
  }
});

// Deezer track info
app.get('/api/deezer/infos', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id parameter' });

  try {
    const url = `https://deezerdevs-deezer.p.rapidapi.com/infos?id=${id}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
        'x-rapidapi-key': DEEZER_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Deezer API error', details: error.message });
  }
});

// Shazam latest release by artist id
app.get('/api/shazam/latest-release', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing artist id parameter' });

  try {
    const url = `https://shazam.p.rapidapi.com/artists/get-latest-release?id=${id}&l=en-US`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'shazam.p.rapidapi.com',
        'x-rapidapi-key': SHAZAM_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Shazam API error', details: error.message });
  }
});

// Genius song recommendations
app.get('/api/genius/recommendations', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing song id parameter' });

  try {
    const url = `https://genius-song-lyrics1.p.rapidapi.com/song/recommendations/?id=${id}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com',
        'x-rapidapi-key': GENIUS_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Genius API error', details: error.message });
  }
});

// Spotify search tracks
app.get('/api/spotify/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter q' });

  const token = await getSpotifyAccessToken();
  if (!token) return res.status(500).json({ error: 'Failed to get Spotify access token' });

  try {
    const url = `https://api.spotify.com/v1/search?${qs.stringify({
      q,
      type: 'track',
      limit: 10,
    })}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Spotify API error', details: error.message });
  }
});

// Simple ping to test server
app.get('/ping', (req, res) => {
  res.json({ pong: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

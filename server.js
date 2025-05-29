import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import qs from 'qs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// Static path setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());

// =================== API KEYS =====================
const LASTFM_API_KEY = 'ea2e0dbd4e7e3e6489164642b18072f9';
const DEEZER_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const SHAZAM_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const GENIUS_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const SPOTIFY_CLIENT_ID = '85564f2ed8ca48d6824f5ec710801fb7';
const SPOTIFY_CLIENT_SECRET = 'd3491fbd8e0845b1a8e8be5d0f89c252';

// =================== ROUTES =====================

// Last.fm
app.get('/api/lastfm/search', async (req, res) => {
  const { track } = req.query;
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${track}&api_key=${LASTFM_API_KEY}&format=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Last.fm API error', details: err.message });
  }
});

// Spotify Auth
let spotifyToken = '';
async function fetchSpotifyToken() {
  const authString = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: qs.stringify({ grant_type: 'client_credentials' }),
  });
  const data = await response.json();
  spotifyToken = data.access_token;
}

// Spotify Search
app.get('/api/spotify/search', async (req, res) => {
  const { query } = req.query;
  if (!spotifyToken) await fetchSpotifyToken();

  try {
    const response = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=5`, {
      headers: {
        Authorization: `Bearer ${spotifyToken}`,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Spotify API error', details: err.message });
  }
});

// Deezer
app.get('/api/deezer', async (req, res) => {
  try {
    const response = await fetch('https://deezerdevs-deezer.p.rapidapi.com/infos', {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
        'x-rapidapi-key': DEEZER_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Deezer API error', details: err.message });
  }
});

// Shazam Artist Latest Release
app.get('/api/shazam/latest-release', async (req, res) => {
  const { id } = req.query;
  try {
    const response = await fetch(`https://shazam.p.rapidapi.com/artists/get-latest-release?id=${id}&l=en-US`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'shazam.p.rapidapi.com',
        'x-rapidapi-key': SHAZAM_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Shazam API error', details: err.message });
  }
});

// Genius Song Recommendations
app.get('/api/genius/recommendations', async (req, res) => {
  const { id } = req.query;
  try {
    const response = await fetch(`https://genius-song-lyrics1.p.rapidapi.com/song/recommendations/?id=${id}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com',
        'x-rapidapi-key': GENIUS_API_KEY,
      },
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Genius API error', details: err.message });
  }
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =================== START =====================
app.listen(PORT, () => {
  console.log(`✅ Server started at http://localhost:${PORT}`);
});

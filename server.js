const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const btoa = require('btoa');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// API keys
const LASTFM_API_KEY = 'ea2e0dbd4e7e3e6489164642b18072f9';
const DEEZER_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const SHAZAM_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';
const GENIUS_API_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb';

const SPOTIFY_CLIENT_ID = '85564f2ed8ca48d6824f5ec710801fb7';
const SPOTIFY_CLIENT_SECRET = 'd3491fbd8e0845b1a8e8be5d0f89c252';

let spotifyToken = null;
let spotifyTokenExpiresAt = 0;

// Get Spotify Access Token (Client Credentials Flow)
async function getSpotifyAccessToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiresAt) {
    return spotifyToken;
  }

  const authString = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to get Spotify token');
  }

  const data = await response.json();
  spotifyToken = data.access_token;
  spotifyTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return spotifyToken;
}

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Last.fm Track Search
app.get('/api/lastfm/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query missing' });

    const url = `http://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(q)}&api_key=${LASTFM_API_KEY}&format=json&limit=10`;
    const response = await fetch(url);
    const data = await response.json();

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Deezer Search
app.get('/api/deezer/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query missing' });

    const url = `https://deezerdevs-deezer.p.rapidapi.com/search?q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
        'x-rapidapi-key': DEEZER_API_KEY,
      }
    });
    const data = await response.json();

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Shazam Search
app.get('/api/shazam/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query missing' });

    const url = `https://shazam.p.rapidapi.com/search?term=${encodeURIComponent(q)}&locale=en-US&offset=0&limit=10`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'shazam.p.rapidapi.com',
        'x-rapidapi-key': SHAZAM_API_KEY,
      }
    });
    const data = await response.json();

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Spotify Search
app.get('/api/spotify/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query missing' });

    const token = await getSpotifyAccessToken();

    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track,artist&limit=10`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Genius Song Recommendations
app.get('/api/genius/recommendations', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Song ID missing' });

    const url = `https://genius-song-lyrics1.p.rapidapi.com/song/recommendations/?id=${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      headers: {
        'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com',
        'x-rapidapi-key': GENIUS_API_KEY,
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
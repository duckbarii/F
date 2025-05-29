// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// --- API Keys and Secrets ---
// IMPORTANT: For production, use environment variables!
// const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
// const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Hardcoding for example, use environment variables in production!
const RAPIDAPI_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb'; // Used for Spotify Lyrics RapidAPI
const SPOTIFY_CLIENT_ID = '85564f2ed8ca48d6824f5ec710801fb7';
const SPOTIFY_CLIENT_SECRET = 'd3491fbd8e0845b1a8e8be5d0f89c252';

let spotifyAccessToken = null; // To store Spotify token
let spotifyTokenExpiry = 0; // To store token expiry time (Unix timestamp)

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // For parsing application/json
app.use(express.static('public')); // Serve static files from the 'public' directory

// --- Helper to get Spotify Access Token (Client Credentials Flow) ---
async function getSpotifyToken() {
    // Check if token exists and is not expired
    if (spotifyAccessToken && Date.now() < spotifyTokenExpiry) {
        return spotifyAccessToken;
    }

    try {
        const authString = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`;
        const base64AuthString = Buffer.from(authString).toString('base64');

        console.log('Attempting to get new Spotify token...');
        const response = await axios.post('https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${base64AuthString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        spotifyAccessToken = response.data.access_token;
        // Calculate expiry time (current time in ms + expiry duration in seconds * 1000 ms/s)
        // Subtract a buffer (e.g., 60 seconds) to renew slightly early
        spotifyTokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        console.log(`Spotify token obtained, expires in ${response.data.expires_in} seconds.`);

        return spotifyAccessToken;
    } catch (error) {
        console.error('Error getting Spotify token:', error.response ? (error.response.data || error.response.status) : error.message);
        spotifyAccessToken = null; // Clear token on error
        spotifyTokenExpiry = 0; // Reset expiry
        // Do NOT throw here, let the calling function handle the error
        return null; // Indicate failure to get token
    }
}


// --- API Endpoints ---

// Endpoint to search Spotify for tracks with previews
app.get('/api/search-tracks', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`Searching Spotify for: ${query}`);
    try {
        const token = await getSpotifyToken();
        if (!token) {
             return res.status(500).json({ error: 'Could not authenticate with Spotify.' });
        }

        const response = await axios.get('https://api.spotify.com/v1/search', {
            params: {
                q: query,
                type: 'track',
                limit: 30 // Get a reasonable number of results
            },
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const spotifyTracks = response.data?.tracks?.items || [];
        // Filter and map results to a common format, include only those with a preview_url
        const resultsWithPreview = spotifyTracks
            .filter(track => track.preview_url) // Only include tracks with a preview
            .map(track => ({
                id: track.id, // Spotify Track ID - essential for lyrics
                title: track.name,
                // Join multiple artists
                artist: track.artists.map(a => a.name).join(', '),
                 // We still might want artist info later, let's keep artistId for now.
                 // But the artist *info* endpoint is removed as requested.
                artistId: track.artists.length > 0 ? track.artists[0].id : null, // Use the first artist's ID for potential future use
                album: track.album.name,
                artwork: track.album.images.length > 0 ? track.album.images[0].url : '', // Get largest image, or empty string
                preview: track.preview_url, // This is the playable URL (30s preview)
                source: 'spotify' // Indicate source
            }));


        res.json({ results: resultsWithPreview });

    } catch (error) {
        console.error('Error searching Spotify:', error.response ? (error.response.data || error.response.status) : error.message);
         if (error.response && error.response.status === 401) {
             res.status(401).json({ error: 'Spotify authentication failed. Check API keys.' });
         } else {
            res.status(500).json({ error: 'Failed to search on Spotify.' });
         }
    }
});

// NEW Endpoint: Get Lyrics using the RapidAPI Spotify Lyrics endpoint
app.get('/api/lyrics-spotify/:spotifyTrackId', async (req, res) => {
     const spotifyTrackId = req.params.spotifyTrackId;

    if (!spotifyTrackId || spotifyTrackId === 'null' || spotifyTrackId === 'undefined') {
         return res.status(400).json({ error: 'Spotify Track ID is required to fetch lyrics.' });
    }

    console.log(`Fetching lyrics for Spotify Track ID: ${spotifyTrackId}`);
    try {
         // Use the RapidAPI endpoint for lyrics
        const response = await axios.get('https://spotify23.p.rapidapi.com/track_lyrics/', {
             params: { id: spotifyTrackId },
             headers: {
                 'x-rapidapi-host': 'spotify23.p.rapidapi.com',
                 'x-rapidapi-key': RAPIDAPI_KEY // Use the RapidAPI key
             }
        });

         if (!response.data || !response.data.lyrics) {
             res.status(404).json({ lyrics: 'Lyrics not found for this track.' });
         } else {
            // The structure might vary, adapt based on actual response
            // Assuming 'lyrics' object contains 'lines' array
            const lyricsLines = response.data.lyrics.lines;
            let formattedLyrics = '';
            if (lyricsLines && Array.isArray(lyricsLines)) {
                 formattedLyrics = lyricsLines.map(line => line.words).join('\n');
            } else {
                 formattedLyrics = 'Lyrics data format unexpected.';
                 console.warn("Unexpected lyrics data format:", response.data);
            }


            res.json({ lyrics: formattedLyrics });
         }

    } catch (error) {
        console.error('Error fetching lyrics from RapidAPI Spotify:', error.response ? (error.response.data || error.response.status) : error.message);
         if (error.response && error.response.status === 404) {
             res.status(404).json({ lyrics: 'Lyrics not found via RapidAPI.' });
         } else {
            res.status(500).json({ error: 'Failed to fetch lyrics.' });
        }
    }
});

// Remove the /api/artist/:spotifyArtistId endpoint as requested
// (Previous implementation was using api.spotify.com/v1/artists)


// Deezer Infos Endpoint (kept as an example, not used in player logic)
app.get('/api/deezer/infos', async (req, res) => {
    try {
         console.log('Fetching Deezer infos');
        const response = await axios.get('https://deezerdevs-deezer.p.rapidapi.com/infos', {
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY // Assuming same RapidAPI key
            }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Error fetching Deezer infos:', error.response ? (error.response.data || error.response.status) : error.message);
        res.status(500).json({ error: 'Failed to fetch Deezer infos' });
    }
});


// Serve the index.html file for any other requests
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Serving static files from ${__dirname}/public`);
});
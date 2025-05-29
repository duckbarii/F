// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// --- API Keys and Secrets ---
// IMPORTANT: For production, use environment variables!
// const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY; // If you still need RapidAPI for Shazam/Deezer infos endpoint
// const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
// const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Hardcoding for example, use environment variables in production!
const RAPIDAPI_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb'; // Keep if using Shazam/Deezer infos
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
        throw new Error('Could not get Spotify access token');
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
                id: track.id, // Spotify Track ID
                title: track.name,
                // Join multiple artists
                artist: track.artists.map(a => a.name).join(', '),
                // Get the Spotify Artist ID(s) - useful for fetching artist info
                artistId: track.artists.length > 0 ? track.artists[0].id : null, // Use the first artist's ID for simplicity
                album: track.album.name,
                artwork: track.album.images.length > 0 ? track.album.images[0].url : '', // Get largest image, or empty string
                preview: track.preview_url, // This is the playable URL
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

// Endpoint to get Spotify Artist Info
// This endpoint now correctly uses the Spotify Artist API
app.get('/api/artist/:spotifyArtistId', async (req, res) => {
     const spotifyArtistId = req.params.spotifyArtistId;

    if (!spotifyArtistId || spotifyArtistId === 'null') { // Check if ID is provided and not the string 'null'
         return res.status(400).json({ error: 'Spotify Artist ID is required.' });
    }

    console.log(`Fetching artist info for Spotify Artist ID: ${spotifyArtistId}`);
    try {
        const token = await getSpotifyToken();
        const response = await axios.get(`https://api.spotify.com/v1/artists/${spotifyArtistId}`, {
             headers: {
                 'Authorization': `Bearer ${token}`
             }
        });

         if (!response.data || Object.keys(response.data).length === 0) {
             res.status(404).json({ error: 'Artist info not found or empty response from Spotify.' });
         } else {
            // Return relevant Spotify artist info
            const artistInfo = {
                name: response.data.name,
                genres: response.data.genres.join(', ') || 'N/A',
                followers: response.data.followers ? response.data.followers.total.toLocaleString() : 'N/A',
                popularity: response.data.popularity || 'N/A', // 0-100
                imageUrl: response.data.images.length > 0 ? response.data.images[0].url : '',
                spotifyUrl: response.data.external_urls?.spotify || '#'
                // Add more fields as needed
            };
            res.json(artistInfo);
         }

    } catch (error) {
        console.error('Error fetching artist info from Spotify:', error.response ? (error.response.data || error.response.status) : error.message);
         if (error.response && error.response.status === 404) {
             res.status(404).json({ error: 'Artist info not found for this ID.' });
         } else {
            res.status(500).json({ error: 'Failed to fetch artist info from Spotify.' });
        }
    }
});

// Deezer Infos Endpoint (kept as an example, not used in player logic)
app.get('/api/deezer/infos', async (req, res) => {
    try {
         console.log('Fetching Deezer infos');
        const response = await axios.get('https://deezerdevs-deezer.p.rapidapi.com/infos', {
            headers: {
                'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY
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
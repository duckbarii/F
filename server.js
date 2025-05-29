// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const app = express();
const port = process.env.PORT || 3000;

// --- API Keys and Secrets ---
// IMPORTANT: For production, use environment variables!
// const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
// const DEEZER_RAPIDAPI_KEY = process.env.DEEZER_RAPIDAPI_KEY;
// const SHAZAM_RAPIDAPI_KEY = process.env.SHAZAM_RAPIDAPI_KEY;
// const GENIUS_RAPIDAPI_KEY = process.env.GENIUS_RAPIDAPI_KEY;
// const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
// const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Hardcoding for example, use environment variables in production!
const LASTFM_API_KEY = 'ea2e0dbd4e7e3e6489164642b18072f9';
const RAPIDAPI_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb'; // Common RapidAPI key
const SPOTIFY_CLIENT_ID = '85564f2ed8ca48d6824f5ec710801fb7';
const SPOTIFY_CLIENT_SECRET = 'd3491fbd8e0845b1a8e8be5d0f89c252';

let spotifyAccessToken = null; // To store Spotify token

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // For parsing application/json
app.use(express.static('public')); // Serve static files from the 'public' directory

// --- Helper to get Spotify Access Token (Client Credentials Flow) ---
async function getSpotifyToken() {
    if (spotifyAccessToken) {
        // Check if token is still valid (optional, can add expiry check)
        return spotifyAccessToken;
    }

    try {
        const authString = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`;
        const base64AuthString = Buffer.from(authString).toString('base64');

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
        // Set a timeout to clear the token before it expires (e.g., response.data.expires_in)
        setTimeout(() => { spotifyAccessToken = null; }, (response.data.expires_in - 60) * 1000); // Clear token 1 min before expiry
        return spotifyAccessToken;
    } catch (error) {
        console.error('Error getting Spotify token:', error.response ? error.response.data : error.message);
        spotifyAccessToken = null; // Clear token on error
        throw new Error('Could not get Spotify access token');
    }
}


// --- API Endpoints ---

// Search endpoint (proxies requests to different APIs)
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    const apiSource = req.query.api || 'deezer'; // Default to Deezer
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    try {
        let results = [];
        let audioSourceKey = null; // To identify which API provides a useful preview URL

        if (apiSource === 'deezer') {
            console.log(`Searching Deezer for: ${query}`);
            const response = await axios.get('https://deezerdevs-deezer.p.rapidapi.com/search', {
                params: { q: query },
                headers: {
                    'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                    'x-rapidapi-key': RAPIDAPI_KEY
                }
            });
            // Map Deezer results to a common format
             results = response.data.data.map(track => ({
                id: track.id,
                title: track.title,
                artist: track.artist.name,
                album: track.album.title,
                artwork: track.album.cover_medium || track.album.cover_xl, // Use medium or large cover
                preview: track.preview, // Deezer provides 30s preview
                source: 'deezer' // Add source identifier
            }));
             audioSourceKey = 'preview'; // Indicate that 'preview' field has audio
             // Filter out results without a preview link
            results = results.filter(track => track.preview);


        } else if (apiSource === 'spotify') {
             console.log(`Searching Spotify for: ${query}`);
            const token = await getSpotifyToken();
            const response = await axios.get('https://api.spotify.com/v1/search', {
                params: {
                    q: query,
                    type: 'track',
                    limit: 20 // Limit results
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            // Map Spotify results to a common format
            results = response.data.tracks.items.map(track => ({
                 id: track.id,
                 title: track.name,
                 artist: track.artists.map(a => a.name).join(', '),
                 album: track.album.name,
                 artwork: track.album.images[0]?.url || track.album.images[1]?.url || '', // Get largest or medium image
                 preview: track.preview_url, // Spotify provides 30s preview
                 source: 'spotify' // Add source identifier
             }));
             audioSourceKey = 'preview'; // Indicate that 'preview' field has audio
             // Filter out results without a preview link
             results = results.filter(track => track.preview);


        } else if (apiSource === 'lastfm') {
             console.log(`Searching Last.fm for: ${query}`);
             // Last.fm search is more basic, mainly metadata. No audio previews usually.
            const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
                params: {
                    method: 'track.search',
                    track: query,
                    api_key: LASTFM_API_KEY,
                    format: 'json',
                    limit: 20
                }
            });
            // Map Last.fm results
            results = response.data.results.trackmatches.track.map(track => ({
                id: track.mbid || `${track.name}-${track.artist}`, // Use MBID or unique string
                title: track.name,
                artist: track.artist,
                album: 'N/A', // Last.fm search doesn't always provide album in this view
                artwork: track.image ? track.image.find(img => img.size === 'large' || img.size === 'medium')['#text'] : '', // Find image
                preview: null, // Last.fm usually doesn't have previews here
                source: 'lastfm' // Add source identifier
            }));
             audioSourceKey = null; // No audio source directly from Last.fm search

        } else {
            return res.status(400).json({ error: 'Invalid API source specified' });
        }

        res.json({ results, audioSourceKey });

    } catch (error) {
        console.error(`Error searching ${apiSource}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ error: `Failed to search on ${apiSource}` });
    }
});

// Endpoint to get lyrics (using Genius)
// Note: Genius API often requires the track ID from their platform.
// The search results from other APIs might not contain the Genius ID.
// A more robust implementation would search Genius separately or link by title/artist.
app.get('/api/lyrics/:trackId', async (req, res) => {
    const trackId = req.params.trackId;
     // This ID needs to be a Genius track ID. Using a placeholder here.
     // A real implementation needs to find the Genius ID based on the searched track.
     const geniusTrackId = req.query.geniusId || trackId; // Allow passing Genius ID

    console.log(`Fetching lyrics for Genius ID: ${geniusTrackId}`);
    try {
        const response = await axios.get(`https://genius-song-lyrics1.p.rapidapi.com/song/lyrics/?id=${geniusTrackId}`, {
             headers: {
                 'x-rapidapi-host': 'genius-song-lyrics1.p.rapidapi.com',
                 'x-rapidapi-key': RAPIDAPI_KEY
             }
        });
        // Genius API response structure can be complex, extract just the lyrics text if possible
        // This part might need adjustment based on actual API response
         const lyrics = response.data.lyrics.lyrics.body.html; // Example path, check actual response
        res.json({ lyrics });
    } catch (error) {
         console.error('Error fetching lyrics from Genius:', error.response ? error.response.data : error.message);
         // If the error is a 404 or similar, return no lyrics found
         if (error.response && error.response.status === 404) {
             res.status(404).json({ lyrics: 'Lyrics not found for this track ID.' });
         } else {
            res.status(500).json({ error: 'Failed to fetch lyrics' });
         }
    }
});


// Endpoint to get artist info (using Shazam - latest release example)
// Note: Shazam API often requires their internal artist ID.
// This example uses the endpoint provided by the user which needs a Shazam Artist ID (73406786 is a placeholder).
// A real implementation needs to find the Shazam Artist ID based on the artist name from search results.
app.get('/api/artist/:artistId', async (req, res) => {
     const artistId = req.params.artistId;
     // This ID needs to be a Shazam Artist ID. Using a placeholder here.
     // A real implementation needs to find the Shazam Artist ID based on the artist name.
     const shazamArtistId = req.query.shazamId || artistId; // Allow passing Shazam ID

    console.log(`Fetching artist info for Shazam ID: ${shazamArtistId}`);
    try {
        const response = await axios.get(`https://shazam.p.rapidapi.com/artists/get-latest-release?id=${shazamArtistId}&l=en-US`, {
             headers: {
                 'x-rapidapi-host': 'shazam.p.rapidapi.com',
                 'x-rapidapi-key': RAPIDAPI_KEY
             }
        });
        // The structure of the response is specific to the endpoint (latest release).
        // A full artist bio would require a different Shazam/Spotify/Last.fm endpoint.
        // Returning the raw response for now.
        res.json(response.data); // Or structure the data as needed
    } catch (error) {
        console.error('Error fetching artist info from Shazam:', error.response ? error.response.data : error.message);
         if (error.response && error.response.status === 404) {
             res.status(404).json({ error: 'Artist info not found for this ID.' });
         } else {
            res.status(500).json({ error: 'Failed to fetch artist info' });
        }
    }
});

// Deezer Infos Endpoint (user provided, but not useful for search/playback)
// Keeping it here as an example endpoint
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
        console.error('Error fetching Deezer infos:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch Deezer infos' });
    }
});


// Serve the index.html file for any other requests (SPA routing concept)
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});


// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(`Serving static files from ${__dirname}/public`);
});
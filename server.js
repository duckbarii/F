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
// const DEEZER_RAPIDAPI_KEY = process.env.DEEZER_RAPIDAPI_KEY; // If you use a different key for Deezer
// const SHAZAM_RAPIDAPI_KEY = process.env.SHAZAM_RAPIDAPI_KEY; // If you use a different key for Shazam
// const GENIUS_RAPIDAPI_KEY = process.env.GENIUS_RAPIDAPI_KEY; // Not needed anymore for lyrics
// const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
// const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// Hardcoding for example, use environment variables in production!
const LASTFM_API_KEY = 'ea2e0dbd4e7e3e6489164642b18072f9';
const RAPIDAPI_KEY = '31764eb588msha5540e4e3f93c68p1df091jsn450ff642f9cb'; // Common RapidAPI key for Deezer & Shazam
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
        // Check if token is still valid (optional, can add expiry check based on response.data.expires_in)
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
        // Set a timeout to clear the token before it expires (e.g., response.data.expires_in)
        // Clear token 1 minute before actual expiry
        const expiresInMs = (response.data.expires_in - 60) * 1000;
        console.log(`Spotify token obtained, expires in ${response.data.expires_in} seconds.`);
        setTimeout(() => {
             spotifyAccessToken = null;
             console.log('Spotify token expired or cleared.');
            }, expiresInMs > 0 ? expiresInMs : 1000); // Ensure timeout is positive


        return spotifyAccessToken;
    } catch (error) {
        console.error('Error getting Spotify token:', error.response ? (error.response.data || error.response.status) : error.message);
        spotifyAccessToken = null; // Clear token on error
        throw new Error('Could not get Spotify access token');
    }
}


// --- API Endpoints ---

// Endpoint to search for track metadata (using Last.fm)
// This endpoint ONLY provides metadata, not playable URLs.
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
    }

    console.log(`Searching Last.fm for metadata: ${query}`);
    try {
        const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
            params: {
                method: 'track.search',
                track: query,
                api_key: LASTFM_API_KEY,
                format: 'json',
                limit: 30 // Get more results
            }
        });

        const results = response.data?.results?.trackmatches?.track;

        if (!results || results.length === 0) {
             return res.json({ results: [] });
        }

        // Map Last.fm results - ensure structure is useful for frontend
        const formattedResults = results.map(track => ({
            // Use a unique identifier, but note this is NOT for playing
            id: track.mbid || `${track.name}-${track.artist}`,
            title: track.name,
            artist: track.artist,
            // Find a suitable image URL (large, medium, or empty string)
            artwork: track.image ?
                     (track.image.find(img => img.size === 'large' || img.size === 'medium' || img.size === 'small') || { '#text': '' })['#text']
                     : '',
            source: 'lastfm' // Indicate source
            // IMPORTANT: NO 'preview' field here.
        }));

        res.json({ results: formattedResults });

    } catch (error) {
        console.error('Error searching Last.fm:', error.response ? (error.response.data || error.response.status) : error.message);
        res.status(500).json({ error: 'Failed to search on Last.fm' });
    }
});

// NEW Endpoint: Find a playable track URL based on Title and Artist
// This endpoint will try Spotify first, then Deezer.
app.get('/api/get-playable-track', async (req, res) => {
     const { title, artist } = req.query;

     if (!title || !artist) {
         return res.status(400).json({ error: 'Title and artist are required to find a playable track.' });
     }

     const searchQuery = `${title} artist:${artist}`; // Refined query for better results

     console.log(`Attempting to find playable track for: "${title}" by ${artist}`);

     try {
         // --- 1. Try Spotify ---
         console.log('Trying Spotify...');
         try {
             const token = await getSpotifyToken();
             const spotifyResponse = await axios.get('https://api.spotify.com/v1/search', {
                 params: {
                     q: searchQuery, // Use refined query
                     type: 'track',
                     limit: 5 // Get a few results to find a good match
                 },
                 headers: {
                     'Authorization': `Bearer ${token}`
                 }
             });

             const spotifyTracks = spotifyResponse.data?.tracks?.items || [];
             // Find a track with a preview URL
             const playableSpotifyTrack = spotifyTracks.find(track => track.preview_url);

             if (playableSpotifyTrack) {
                 console.log('Found playable track on Spotify.');
                 return res.json({
                     id: playableSpotifyTrack.id,
                     title: playableSpotifyTrack.name,
                     artist: playableSpotifyTrack.artists.map(a => a.name).join(', '),
                     album: playableSpotifyTrack.album.name,
                     artwork: playableSpotifyTrack.album.images[0]?.url || playableSpotifyTrack.album.images[1]?.url || '',
                     preview: playableSpotifyTrack.preview_url, // This is the playable URL
                     source: 'spotify',
                     // Optionally include original Last.fm info if needed later
                     original_title: title,
                     original_artist: artist
                 });
             } else {
                 console.log('Spotify found results but no playable preview.');
             }

         } catch (spotifyError) {
             console.error('Error searching Spotify for playable track:', spotifyError.response ? (spotifyError.response.data || spotifyError.response.status) : spotifyError.message);
             // Continue to Deezer if Spotify fails
         }


         // --- 2. Try Deezer as Fallback ---
         console.log('Trying Deezer as fallback...');
         try {
             const deezerResponse = await axios.get('https://deezerdevs-deezer.p.rapidapi.com/search', {
                 params: { q: searchQuery }, // Use refined query
                 headers: {
                     'x-rapidapi-host': 'deezerdevs-deezer.p.rapidapi.com',
                     'x-rapidapi-key': RAPIDAPI_KEY
                 }
             });

             const deezerTracks = deezerResponse.data?.data || [];
             // Find a track with a preview URL
              const playableDeezerTrack = deezerTracks.find(track => track.preview);

             if (playableDeezerTrack) {
                 console.log('Found playable track on Deezer.');
                 return res.json({
                     id: playableDeezerTrack.id,
                     title: playableDeezerTrack.title,
                     artist: playableDeezerTrack.artist.name,
                     album: playableDeezerTrack.album.title,
                     artwork: playableDeezerTrack.album.cover_medium || playableDeezerTrack.album.cover_xl,
                     preview: playableDeezerTrack.preview, // This is the playable URL
                     source: 'deezer',
                     original_title: title,
                     original_artist: artist
                 });
             } else {
                 console.log('Deezer found results but no playable preview.');
             }

         } catch (deezerError) {
             console.error('Error searching Deezer for playable track:', deezerError.response ? (deezerError.response.data || deezerError.response.status) : deezerError.message);
             // Fallback failed
         }

         // --- If neither found a playable track ---
         console.log(`No playable track found for "${title}" by ${artist} on Spotify or Deezer.`);
         res.status(404).json({ error: 'No playable preview found for this track on available sources.' });


     } catch (overallError) {
         console.error('Overall error finding playable track:', overallError.message);
         res.status(500).json({ error: 'An unexpected error occurred while trying to find a playable track.' });
     }
});


// Endpoint to get artist info (using Shazam - latest release example)
// Note: Needs Shazam Artist ID. This is kept but its utility depends on getting the correct ID.
app.get('/api/artist/:artistId', async (req, res) => {
     const artistId = req.params.artistId;
     // This ID needs to be a Shazam Artist ID. Using a placeholder here.
     // A real implementation needs to find the Shazam Artist ID based on the artist name.
     const shazamArtistId = req.query.shazamId || artistId; // Allow passing Shazam ID

    if (!shazamArtistId || shazamArtistId === 'undefined') { // Basic check for placeholder IDs
         return res.status(400).json({ error: 'Shazam Artist ID is required.' });
    }

    console.log(`Fetching artist info for Shazam ID: ${shazamArtistId}`);
    try {
        const response = await axios.get(`https://shazam.p.rapidapi.com/artists/get-latest-release?id=${shazamArtistId}&l=en-US`, {
             headers: {
                 'x-rapidapi-host': 'shazam.p.rapidapi.com',
                 'x-rapidapi-key': RAPIDAPI_KEY
             }
        });

         if (!response.data || Object.keys(response.data).length === 0) {
             res.status(404).json({ error: 'Artist info not found or empty response from Shazam.' });
         } else {
            res.json(response.data); // Or structure the data as needed
         }

    } catch (error) {
        console.error('Error fetching artist info from Shazam:', error.response ? (error.response.data || error.response.status) : error.message);
         if (error.response && error.response.status === 404) {
             res.status(404).json({ error: 'Artist info not found for this ID.' });
         } else {
            res.status(500).json({ error: 'Failed to fetch artist info' });
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
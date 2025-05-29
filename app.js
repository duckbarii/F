require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const ytdl = require('ytdl-core');
const { google } = require('googleapis');
const fs = require('fs'); // Needed for download header

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Server-side Playback State (Simple, shared state for all clients) ---
let currentTrack = null; // { id, title, artist, thumbnail, duration, ... }
let isPlaying = false;
let currentTime = 0; // In seconds
let audioStream = null; // Keep track of the active stream to potentially close it

// Interval to send time updates
let timeUpdateInterval = null;

function startSendingTimeUpdates() {
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(() => {
        if (isPlaying && currentTrack) {
            // Note: This currentTime is just an estimate/counter.
            // A more accurate sync would involve client reporting its time,
            // or using a synchronized clock library.
            // For simplicity here, we just increment a server counter.
            currentTime += 1; // Assuming 1 second passed
             if (currentTime >= currentTrack.duration) {
                currentTime = 0;
                isPlaying = false; // Song ended (server side estimate)
                currentTrack = null; // Clear current track
                io.emit('trackEnded'); // Notify clients
                clearInterval(timeUpdateInterval); // Stop interval
            }
            io.emit('playbackState', { isPlaying, currentTime, duration: currentTrack ? currentTrack.duration : 0 });
        }
    }, 1000);
}

function stopSendingTimeUpdates() {
    if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
}

// --- Socket.IO for Real-time Sync ---
io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  // Send current state to newly connected client
  socket.emit('initialState', {
    currentTrack,
    isPlaying,
    currentTime,
    // Playlist state is managed client-side in this example
  });

  socket.on('requestTrack', async (videoId) => {
    console.log('Client requested track:', videoId);
    try {
      const info = await ytdl.getInfo(videoId);
      const videoDetails = info.videoDetails;

      currentTrack = {
        id: videoDetails.videoId,
        title: videoDetails.title,
        artist: videoDetails.author.name,
        thumbnail: videoDetails.thumbnails ? videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url : '',
        duration: parseInt(videoDetails.lengthSeconds),
        description: videoDetails.description, // Basic lyrics/bio attempt
      };

      isPlaying = false; // Start paused initially until client requests play
      currentTime = 0;

      // Stop previous stream if any (important for preventing resource leaks)
      if (audioStream) {
          audioStream.destroy(); // ytdl-core streams have a destroy method
          audioStream = null;
      }

      // Broadcast the new track info to all connected clients
      io.emit('trackInfo', currentTrack);
      io.emit('playbackState', { isPlaying, currentTime, duration: currentTrack.duration });

      // Client will now fetch the stream via the /api/stream route
      // The client's <audio> element plays it.
      // The client should then send 'play' when it's ready to start.

    } catch (error) {
      console.error('Error requesting track info:', error);
      socket.emit('error', 'Could not load track information.');
      currentTrack = null;
      isPlaying = false;
      currentTime = 0;
      io.emit('trackInfo', null); // Clear track info on clients
      io.emit('playbackState', { isPlaying, currentTime: 0, duration: 0 });
    }
  });

  socket.on('play', () => {
      console.log('Client sent play');
      if (currentTrack && !isPlaying) {
          isPlaying = true;
          // Server tells all clients to sync state, but clients control their own <audio> play()
          io.emit('playbackState', { isPlaying, currentTime, duration: currentTrack.duration });
          startSendingTimeUpdates(); // Start the server's time counter/broadcaster
      }
  });

  socket.on('pause', () => {
      console.log('Client sent pause');
      if (currentTrack && isPlaying) {
          isPlaying = false;
           // Server tells all clients to sync state, but clients control their own <audio> pause()
          io.emit('playbackState', { isPlaying, currentTime, duration: currentTrack.duration });
          stopSendingTimeUpdates(); // Stop the server's time counter
      }
  });

  socket.on('seek', (time) => {
      console.log('Client sent seek to', time);
      if (currentTrack) {
          currentTime = Math.max(0, Math.min(time, currentTrack.duration)); // Prevent seeking outside bounds
          // Server tells all clients to sync state, but clients control their own <audio> currentTime
          io.emit('playbackState', { isPlaying, currentTime, duration: currentTrack.duration });
          // Note: Actual audio seeking is handled by the client's <audio> element.
          // If the server needed to manage the stream position (e.g., for advanced features),
          // this would be more complex.
      }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
     // If no users are connected, maybe stop the time update interval?
     // Depends on desired behavior (e.g., should playback "continue" server-side?)
     // For this example, let's let it run if a song is playing,
     // or stop if the song ends naturally.
  });
});

// --- API Endpoints ---

// Search YouTube
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter "q"' });
  }

  try {
    const response = await youtube.search.list({
      q: query,
      part: 'snippet',
      maxResults: 20,
      type: 'video', // Only search for videos
      videoCategoryId: '10', // Optional: Filter for music videos
      videoDuration: 'short,medium,long', // Avoid 'any' which might give non-music results
    });

    const results = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.default.url,
      // Note: Duration is not available directly in search results, requires getInfo
      // This is a limitation - need to fetch info for each result or rely on client fetching on click
    }));

    res.json(results);

  } catch (error) {
    console.error('Error searching YouTube:', error);
    res.status(500).json({ error: 'Error searching YouTube' });
  }
});

// Get track info (used by client after search or on initial state)
app.get('/api/info/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    if (!ytdl.validateID(videoId)) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }
    try {
        const info = await ytdl.getInfo(videoId);
        const videoDetails = info.videoDetails;
        res.json({
            id: videoDetails.videoId,
            title: videoDetails.title,
            artist: videoDetails.author.name,
            thumbnail: videoDetails.thumbnails ? videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url : '',
            duration: parseInt(videoDetails.lengthSeconds),
            description: videoDetails.description, // Basic lyrics/bio attempt
        });
    } catch (error) {
        console.error(`Error fetching info for ${videoId}:`, error);
        res.status(500).json({ error: 'Error fetching track info' });
    }
});


// Stream Audio
app.get('/api/stream/:videoId', (req, res) => {
  const videoId = req.params.videoId;
  if (!ytdl.validateID(videoId)) {
    return res.status(400).send('Invalid video ID');
  }

  try {
    // Find the best audio format (m4a is generally preferred)
    const audioFormat = ytdl.chooseFormat(ytdl.getInfo(videoId, { quality: 'highestaudio', filter: 'audioonly' }), { quality: 'highestaudio', filter: 'audioonly' });

    if (!audioFormat) {
        return res.status(404).send('No suitable audio format found');
    }

    const stream = ytdl(videoId, { format: audioFormat });

    // Set appropriate headers for streaming audio
    res.setHeader('Content-Type', 'audio/mpeg'); // ytdl can output various formats, adjust if needed
    res.setHeader('Accept-Ranges', 'bytes'); // Enable seeking

    // Pipe the audio stream to the response
    stream.pipe(res);

    // Keep track of the stream (simple example)
    audioStream = stream;

    stream.on('error', (err) => {
      console.error(`Error streaming video ${videoId}:`, err);
      if (!res.headersSent) {
         res.status(500).send('Error streaming audio');
      }
    });

    // Handle client disconnection
    req.on('close', () => {
        console.log(`Client disconnected from stream ${videoId}`);
        // The stream might stop automatically when the pipe closes,
        // but explicitly destroying can help prevent leaks in some cases.
        // stream.destroy(); // Be cautious if the stream is needed elsewhere
    });

  } catch (error) {
    console.error(`Unexpected error creating stream for ${videoId}:`, error);
    if (!res.headersSent) {
        res.status(500).send('Internal server error during streaming setup');
    }
  }
});

// Download Track
app.get('/api/download/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
     if (!ytdl.validateID(videoId)) {
        return res.status(400).send('Invalid video ID');
    }

    try {
        const info = await ytdl.getInfo(videoId);
        const videoDetails = info.videoDetails;

        // Find the best audio format
        const audioFormat = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });

        if (!audioFormat) {
            return res.status(404).send('No suitable audio format found for download');
        }

        const stream = ytdl(videoId, { format: audioFormat });

        // Sanitize filename
        const filename = `${videoDetails.title.replace(/[^\w\s-]/g, '')}.webm`; // Or .m4a depending on format

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', audioFormat.mimeType);

        stream.pipe(res);

        stream.on('error', (err) => {
            console.error(`Error downloading video ${videoId}:`, err);
             if (!res.headersSent) {
                res.status(500).send('Error downloading audio');
            }
        });

    } catch (error) {
        console.error(`Unexpected error setting up download for ${videoId}:`, error);
         if (!res.headersSent) {
            res.status(500).send('Internal server error during download setup');
        }
    }
});


// Basic Lyrics/Bio Endpoint (Placeholder using description)
// In a real app, you would integrate with a dedicated lyrics/bio API here.
app.get('/api/lyrics/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    try {
         const info = await ytdl.getInfo(videoId);
         // The video description often contains lyrics or links to lyrics/info.
         // This is NOT reliable for all videos or formatted lyrics.
         const description = info.videoDetails.description || "No description available.";
         res.json({ lyrics: description }); // Sending description as 'lyrics'
    } catch (error) {
        console.error(`Error fetching description for lyrics/bio ${videoId}:`, error);
        res.status(500).json({ error: 'Could not fetch description.' });
    }
});

app.get('/api/bio/:artistName', async (req, res) => {
     const artistName = req.params.artistName;
     // This is a placeholder. Fetching a bio reliably requires a dedicated music API
     // like Last.fm, MusicBrainz, etc., which would need API keys and integration.
     res.json({ bio: `Bio information for "${artistName}" would be fetched from a dedicated music API here. (Placeholder)` });
});


// Start the server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});
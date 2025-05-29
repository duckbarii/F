const express = require('express');
const cors = require('cors');
const ytdl = require('ytdl-core');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.static('public'));

const YT_API = process.env.YOUTUBE_API_KEY;

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const ytRes = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
      params: {
        part: 'snippet',
        q,
        maxResults: 1,
        key: YT_API,
        type: 'video'
      }
    });

    const video = ytRes.data.items[0];
    if (!video) return res.status(404).json({ error: 'No result found' });

    res.json({
      videoId: video.id.videoId,
      title: video.snippet.title,
      thumbnail: video.snippet.thumbnails.high.url
    });
  } catch (err) {
    res.status(500).json({ error: 'YouTube API error' });
  }
});

app.get('/api/stream', async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'Missing video ID' });

  const url = `https://www.youtube.com/watch?v=${id}`;

  try {
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });

    if (!format || !format.url) return res.status(500).json({ error: 'Stream URL not found' });

    res.json({ url: format.url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get stream' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

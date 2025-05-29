// server.js
const express = require("express");
const ytdl = require("ytdl-core");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.static("public"));

const YT_API_KEY = process.env.YT_API_KEY || "placeholder";

app.get("/search", async (req, res) => {
  const query = req.query.q;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${YT_API_KEY}`;
  try {
    const response = await axios.get(url);
    const results = response.data.items.map(item => ({
      title: item.snippet.title,
      videoId: item.id.videoId,
      thumbnail: item.snippet.thumbnails.default.url,
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "YouTube API failed", details: err.message });
  }
});

app.get("/stream", (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send("Missing video ID");

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  res.setHeader("Content-Disposition", `inline; filename="${videoId}.mp3"`);

  ytdl(url, {
    filter: "audioonly",
    quality: "highestaudio",
  }).pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

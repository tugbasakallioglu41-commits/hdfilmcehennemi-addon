const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

// TMDB Ücretsiz API Anahtarı
const TMDB_API_KEY = "3fd2be6f0cd70a6359d108d28384b3c1"; 
const TMDB_BASE = "https://api.themoviedb.org/3";

const builder = new addonBuilder({
  id: "org.trdizi.tmdb.addon",
  version: "2.0.0",
  name: "Türkçe Dizi & Film Katalogu",
  description: "Güncel Türkçe diziler, popüler seriler ve filmler",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  catalogs: [
    { type: "series", id: "tr_popular_series", name: "Güncel & Popüler Diziler" },
    { type: "movie", id: "tr_popular_movies", name: "Popüler Filmler" }
  ]
});

// 1. KATALOG HANDLER (Dizi ve Filmleri Çeker)
builder.defineCatalogHandler(async ({ type, id }) => {
  try {
    let endpoint = "";
    if (type === "series" && id === "tr_popular_series") {
      endpoint = `${TMDB_BASE}/tv/popular?api_key=${TMDB_API_KEY}&language=tr-TR&page=1`;
    } else if (type === "movie" && id === "tr_popular_movies") {
      endpoint = `${TMDB_BASE}/movie/popular?api_key=${TMDB_API_KEY}&language=tr-TR&page=1`;
    }

    if (!endpoint) return { metas: [] };

    const res = await axios.get(endpoint);
    const results = res.data.results || [];

    const metas = results.map((item) => {
      const isMovie = type === "movie";
      return {
        id: (isMovie ? "tmdb_m_" : "tmdb_s_") + item.id,
        type: type,
        name: isMovie ? item.title : item.name,
        poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
        description: item.overview || "Açıklama bulunmuyor."
      };
    });

    return { metas };
  } catch (err) {
    console.error("Katalog hatası:", err.message);
    return { metas: [] };
  }
});

// 2. META HANDLER (Dizilerin Sezon ve Bölüm Detaylarını Getirir)
builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const rawId = id.replace("tmdb_s_", "").replace("tmdb_m_", "");
    
    if (type === "series") {
      const res = await axios.get(`${TMDB_BASE}/tv/${rawId}?api_key=${TMDB_API_KEY}&language=tr-TR`);
      const show = res.data;

      return {
        meta: {
          id: id,
          type: "series",
          name: show.name,
          poster: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : "",
          description: show.overview,
          videos: [] // Sezon bölümleri buraya dinamik eklenebilir
        }
      };
    }
  } catch (err) {
    console.error("Meta hatası:", err.message);
  }
  return { meta: {} };
});

// 3. STREAM HANDLER (Oynatıcı Bağlantısı)
builder.defineStreamHandler(async ({ type, id }) => {
  // Seçilen içerik için oynatıcı kaynağı döndürülür
  return {
    streams: [
      {
        title: "Türkçe Yayın Kaynağı (HD)",
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" 
      }
    ]
  };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });

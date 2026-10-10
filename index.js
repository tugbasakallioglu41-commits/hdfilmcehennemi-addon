const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

let CURRENT_DOMAIN = "https://www.hdfilmcehennemi.nl";

const defaultHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Referer": CURRENT_DOMAIN + "/"
};

async function updateWorkingDomain() {
  try {
    const res = await axios.get(CURRENT_DOMAIN, {
      headers: defaultHeaders,
      maxRedirects: 5,
      timeout: 10000
    });
    
    if (res.request) {
      if (res.request.res) {
        if (res.request.res.responseUrl) {
          const finalUrl = new URL(res.request.res.responseUrl);
          CURRENT_DOMAIN = finalUrl.origin;
        }
      }
    }
    console.log(`[Domain Kontrolü] Aktif adres: ${CURRENT_DOMAIN}`);
  } catch (err) {
    console.warn(`[Domain Uyarısı] Varsayılan adres kullanılıyor (${CURRENT_DOMAIN}):`, err.message);
  }
}

const builder = new addonBuilder({
  id: "org.hdfilmcehennemi.mindiptv",
  version: "1.2.0",
  name: "Hdfilmcehennemi Addon",
  description: "Mind IPTV ve Stremio için Hdfilmcehennemi film akış eklentisi",
  resources: ["catalog", "stream"],
  types: ["movie"],
  catalogs: [
    { type: "movie", id: "hdf_movies", name: "Hdfilmcehennemi Son Filmler" }
  ]
});

// 1. KATALOG HANDLER
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type === "movie") {
    if (id === "hdf_movies") {
      await updateWorkingDomain();
      
      try {
        const res = await axios.get(CURRENT_DOMAIN, { headers: defaultHeaders });
        const $ = cheerio.load(res.data);
        const metas = [];

        // Hem poster-pop hem de alternatif film kartı seçicilerini tarıyoruz
        let elements = $(".poster-pop");
        if (elements.length === 0) {
          elements = $(".poster, .movie-box, article");
        }

        elements.each((i, el) => {
          if (i >= 24) return;
          
          let title = $(el).find(".poster-title, .title, h2, h3").first().text().trim();
          if (!title) {
            title = $(el).attr("title") || "Film";
          }

          let href = $(el).attr("href");
          if (!href) {
            href = $(el).find("a").attr("href");
          }
          
          let img = $(el).find("img").attr("data-src");
          if (!img) {
            img = $(el).find("img").attr("src");
          }
          
          if (href) {
            const cleanId = "hdf_" + Buffer.from(href).toString("base64url");
            
            let finalPoster = "";
            if (img) {
              if (img.startsWith("http")) {
                finalPoster = img;
              } else {
                finalPoster = CURRENT_DOMAIN + img;
              }
            }

            metas.push({
              id: cleanId,
              type: "movie",
              name: title,
              poster: finalPoster
            });
          }
        });

        console.log(`[Katalog] Toplam ${metas.length} film bulundu.`);
        return { metas };
      } catch (err) {
        console.error("Katalog çekme hatası:", err.message);
        return { metas: [] };
      }
    }
  }
  return { metas: [] };
});

// 2. STREAM HANDLER
builder.defineStreamHandler(async ({ type, id }) => {
  if (type === "movie") {
    if (id.startsWith("hdf_")) {
      try {
        const pagePath = Buffer.from(id.replace("hdf_", ""), "base64url").toString("utf-8");
        
        let targetUrl = pagePath;
        if (!pagePath.startsWith("http")) {
          targetUrl = CURRENT_DOMAIN + pagePath;
        }

        const res = await axios.get(targetUrl, { headers: defaultHeaders });
        const $ = cheerio.load(res.data);
        
        // Oynatıcı / Iframe tespiti
        let iframeSrc = $("iframe").first().attr("src");
        if (!iframeSrc) {
          iframeSrc = $("iframe[data-src]").first().attr("data-src");
        }

        if (iframeSrc) {
          let fullStreamUrl = iframeSrc;
          if (iframeSrc.startsWith("//")) {
            fullStreamUrl = "https:" + iframeSrc;
          }
          
          return {
            streams: [
              {
                title: "Hdfilmcehennemi - Web Player",
                url: fullStreamUrl,
                behaviorHints: {
                  notResponseLocation: true,
                  proxyHeaders: {
                    request: {
                      "User-Agent": defaultHeaders["User-Agent"],
                      "Referer": CURRENT_DOMAIN + "/"
                    }
                  }
                }
              }
            ]
          };
        }
      } catch (err) {
        console.error("Stream çekme hatası:", err.message);
      }
    }
  }
  return { streams: [] };
});

// Sunucuyu başlat
serveHTTP(builder.getInterface(), { port: 7000 });
console.log("Addon çalışıyor: http://127.0.0.1:7000/manifest.json");

const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

let CURRENT_DOMAIN = "https://www.hdfilmcehennemi.nl";

// Puppeteer ile sayfadaki HTML içeriği Cloudflare'i geçerek alma
async function fetchHtmlWithPuppeteer(targetUrl) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu"
      ],
      // Render/Linux ortamında varsayılan Chrome/Chromium yolu
      executablePath: process.env.PUPPETEER_EXEC_PATH || null
    });

    const page = await browser.newPage();
    
    // Gerçek tarayıcı başlığı ayarla
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // Cloudflare doğrulamasını bekle ve sayfayı yükle
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    
    // Sayfanın tam yüklenmesi ve Cloudflare challenge'ın geçilmesi için kısa bekleme
    await page.waitForTimeout(3000);

    const html = await page.content();
    await browser.close();
    return html;
  } catch (err) {
    console.error("[Puppeteer Hatası]:", err.message);
    if (browser) await browser.close();
    return null;
  }
}

const builder = new addonBuilder({
  id: "org.hdfilmcehennemi.mindiptv",
  version: "1.3.0",
  name: "Hdfilmcehennemi Addon (Stealth)",
  description: "Mind IPTV ve Stremio için Puppeteer tabanlı Hdfilmcehennemi eklentisi",
  resources: ["catalog", "stream"],
  types: ["movie"],
  catalogs: [
    { type: "movie", id: "hdf_movies", name: "Hdfilmcehennemi Son Filmler" }
  ]
});

// 1. KATALOG HANDLER
builder.defineCatalogHandler(async ({ type, id }) => {
  if (type === "movie" && id === "hdf_movies") {
    try {
      console.log(`[Katalog İsteği] Puppeteer ile çekiliyor: ${CURRENT_DOMAIN}`);
      const html = await fetchHtmlWithPuppeteer(CURRENT_DOMAIN);
      
      if (!html) return { metas: [] };

      const $ = cheerio.load(html);
      const metas = [];

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

      console.log(`[Katalog] Başarıyla ${metas.length} adet film çekildi.`);
      return { metas };
    } catch (err) {
      console.error("Katalog çekme hatası:", err.message);
      return { metas: [] };
    }
  }
  return { metas: [] };
});

// 2. STREAM HANDLER
builder.defineStreamHandler(async ({ type, id }) => {
  if (type === "movie" && id.startsWith("hdf_")) {
    try {
      const pagePath = Buffer.from(id.replace("hdf_", ""), "base64url").toString("utf-8");
      
      let targetUrl = pagePath;
      if (!pagePath.startsWith("http")) {
        targetUrl = CURRENT_DOMAIN + pagePath;
      }

      console.log(`[Stream İsteği] Puppeteer ile taranıyor: ${targetUrl}`);
      const html = await fetchHtmlWithPuppeteer(targetUrl);
      
      if (!html) return { streams: [] };

      const $ = cheerio.load(html);
      
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
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
  return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: 7000 });
console.log("Addon çalışıyor: http://127.0.0.1:7000/manifest.json");

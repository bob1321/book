// LectuepubLibre6 — Source pour Cinder
// Version corrigée pour l'affichage des résultats

var LectuepubLibre6 = {};

LectuepubLibre6.id = "lectuepub6";
LectuepubLibre6.name = "Lectuepub Libre";
LectuepubLibre6.version = "1.0.2";
LectuepubLibre6.icon = "book-outline";
LectuepubLibre6.description = "Descargar libros EPUB y PDF gratis en español.";

LectuepubLibre6.contentType = "books";
LectuepubLibre6.contentTypes = ["ebook"];

LectuepubLibre6.capabilities = {
  search: true,
  discover: true,
  download: false,
  resolve: true,
  searchDownloads: true,
  bookChapters: false,
  manga: false,
};

LectuepubLibre6.UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
LectuepubLibre6.baseUrl = "https://lectuepublibre6.com";

// ─── Utilitaires ─────────────────────────────────────────────────────────────

LectuepubLibre6._cleanText = function(text) {
  if (!text) return "";
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function(match, dec) { return String.fromCharCode(dec); })
    .replace(/<[^>]+>/g, "")
    .trim();
};

LectuepubLibre6._cleanUrl = function(url) {
  if (!url) return "";
  url = url.replace(/&amp;/g, "&");
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return this.baseUrl + url;
  if (!url.startsWith("http")) return this.baseUrl + "/" + url;
  return url;
};

// ─── Recherche ─────────────────────────────────────────────────────────────

LectuepubLibre6.search = async function(query, page) {
  var q = String(query || "").trim();
  if (!q) return [];

  var p = page && page > 1 ? page : 1;
  var searchUrl = this.baseUrl + "/page/" + p + "/?s=" + encodeURIComponent(q) + "&post_type=post";

  try {
    var r = await cinder.fetch(searchUrl, {
      method: "GET",
      headers: {
        "User-Agent": this.UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Pas de réponse");
    }

    var html = String(r.data);
    var results = [];

    // Pattern principal: articles WordPress
    var articleRegex = /<article[^>]*class=["'][^"']*(?:post|entry)[^"']*["'][^>]*>([\s\S]*?)<\/article>/gi;
    var match;
    
    while ((match = articleRegex.exec(html)) !== null) {
      var article = match[1];
      
      // Extraire le lien et le titre
      var linkMatch = article.match(/<h[23][^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i) ||
                      article.match(/<a[^>]+href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                      article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      
      if (!linkMatch) continue;
      
      var bookUrl = this._cleanUrl(linkMatch[1]);
      var rawTitle = linkMatch[2] || "";
      var title = this._cleanText(rawTitle);
      
      // Filtrer les pages non-livres
      if (!bookUrl || bookUrl.includes("/page/") || bookUrl.includes("/category/") || bookUrl.includes("/tag/")) {
        continue;
      }
      
      if (!title || title.length < 2) continue;
      
      // Extraire l'image
      var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) ||
                     article.match(/<img[^>]+data-src=["']([^"']+)["'][^>]*>/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      // Extraire l'auteur (souvent dans les tags)
      var authorMatch = article.match(/<a[^>]+rel=["']tag["'][^>]*>([^<]+)<\/a>/i);
      var author = authorMatch ? this._cleanText(authorMatch[1]) : undefined;

      // IMPORTANT: Extraire l'ID depuis l'URL
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(Math.random());

      // Format du résultat pour Cinder
      results.push({
        id: "lp6_" + bookId,  // ID unique obligatoire
        title: title,
        author: author || "Desconocido",
        cover: cover,
        description: undefined,
        format: undefined,  // On ne sait pas encore le format
        source: this.name,
        // extra contient les données nécessaires pour resolve()
        extra: {
          bookUrl: bookUrl,
          bookId: bookId
        }
      });
    }

    return results;

  } catch (e) {
    cinder.error("[lectuepub] Erreur: " + e.message);
    throw new Error("Erreur de recherche: " + e.message);
  }
};

// ─── Découverte ─────────────────────────────────────────────────────────────

LectuepubLibre6.getDiscoverSections = async function() {
  return [
    { id: "novedades", title: "Novedades", icon: "time" },
    { id: "populares", title: "Populares", icon: "flame" }
  ];
};

LectuepubLibre6.getDiscoverItems = async function(sectionId, page) {
  var p = page && page > 1 ? page : 1;
  var url = this.baseUrl + "/page/" + p + "/";

  try {
    var r = await cinder.fetch(url, {
      method: "GET",
      headers: { "User-Agent": this.UA, "Accept": "text/html,*/*" },
      timeout: 30000,
    });

    if (!r || !r.data) return [];

    var html = String(r.data);
    var results = [];

    var articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
    var match;
    
    while ((match = articleRegex.exec(html)) !== null) {
      var article = match[1];
      
      var linkMatch = article.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      
      var bookUrl = this._cleanUrl(linkMatch[1]);
      var title = this._cleanText(linkMatch[2]);
      
      if (!title || title.length < 2) continue;
      if (bookUrl.includes("/page/") || bookUrl.includes("/category/")) continue;
      
      var imgMatch = article.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      var cover = imgMatch ? this._cleanUrl(imgMatch[1]) : undefined;
      
      var idMatch = bookUrl.match(/\/([^\/]+)\/?$/);
      var bookId = idMatch ? idMatch[1] : String(Math.random());

      results.push({
        id: "lp6_" + bookId,
        title: title,
        author: "Desconocido",
        cover: cover,
        source: this.name,
        extra: { bookUrl: bookUrl, bookId: bookId }
      });
    }

    return results;

  } catch (e) {
    return [];
  }
};

// ─── Résolution du lien de téléchargement ───────────────────────────────────

LectuepubLibre6.resolve = async function(item) {
  var e = (item && item.extra) || {};
  
  if (!e.bookUrl) {
    throw new Error("URL du livre manquante dans extra");
  }

  try {
    var r = await cinder.fetch(e.bookUrl, {
      method: "GET",
      headers: { "User-Agent": this.UA, "Accept": "text/html,*/*" },
      timeout: 30000,
    });

    if (!r || !r.data) {
      throw new Error("Page inaccessible");
    }

    var html = String(r.data);
    var downloadUrl = null;
    var fileFormat = "epub";

    // Chercher lien EPUB
    var epubMatch = html.match(/href=["']([^"']+\.epub[^"']*)["']/i) ||
                    html.match(/href=["']([^"']+)["'][^>]*>[^<]*EPUB/i);
    if (epubMatch) {
      downloadUrl = this._cleanUrl(epubMatch[1]);
      fileFormat = "epub";
    }

    // Chercher lien PDF si pas d'EPUB
    if (!downloadUrl) {
      var pdfMatch = html.match(/href=["']([^"']+\.pdf[^"']*)["']/i) ||
                     html.match(/href=["']([^"']+)["'][^>]*>[^<]*PDF/i);
      if (pdfMatch) {
        downloadUrl = this._cleanUrl(pdfMatch[1]);
        fileFormat = "pdf";
      }
    }

    // Pattern général pour boutons download
    if (!downloadUrl) {
      var btnMatch = html.match(/<a[^>]+class=["'][^"']*download[^"']*["'][^>]+href=["']([^"']+)["']/i);
      if (btnMatch) {
        downloadUrl = this._cleanUrl(btnMatch[1]);
      }
    }

    if (!downloadUrl) {
      throw new Error("Aucun lien de téléchargement trouvé sur la page");
    }

    // Déterminer format depuis URL
    if (downloadUrl.toLowerCase().includes(".pdf")) fileFormat = "pdf";
    else if (downloadUrl.toLowerCase().includes(".epub")) fileFormat = "epub";

    var fileName = String(item.title || "libro")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .trim() + "." + fileFormat;

    return {
      url: downloadUrl,
      fileName: fileName,
    };

  } catch (e) {
    throw new Error("Erreur lors de la résolution: " + e.message);
  }
};

__cinderExport = LectuepubLibre6;

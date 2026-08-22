// LectuepubLibre6 — Source pour Cinder
// Version utilisant cinder.parseHTML() comme dans les exemples officiels

__cinderExport = {
	id: "lectuepub6",
	name: "Lectuepub Libre",
	version: "1.0.8",
	icon: "📚",
	description: "Descargar libros EPUB y PDF gratis en español desde LectuepubLibre6",
	contentType: "books",
	contentTypes: ["ebook"],

	capabilities: {
		search: true,
		discover: true,
		download: false,
		resolve: true,
		searchDownloads: true,
		manga: false,
	},

	_BASE_URL: "https://lectuepublibre6.com",

	_absUrl: function(url) {
		if (!url) return "";
		if (url.indexOf("//") === 0) return "https:" + url;
		if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
		if (url.charAt(0) === "/") return this._BASE_URL + url;
		return this._BASE_URL + "/" + url;
	},

	_clean: function(value) {
		if (typeof cinder !== "undefined" && cinder.normalizeText) {
			return cinder.normalizeText(String(value || ""));
		}
		return String(value || "")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/\s+/g, " ")
			.trim();
	},

	_fetchPage: async function(url) {
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "es-ES,es;q=0.9",
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				},
				timeout: 30000,
			});
			if (this._isUsableHtml(resp)) return resp;
		} catch (err) {
			cinder.warn("[LectuepubLibre6] Fetch failed: " + err);
		}
		return null;
	},

	_isUsableHtml: function(resp) {
		if (!resp || resp.status < 200 || resp.status >= 400) return false;
		var data = resp.data || "";
		if (data.length < 1000) return false;
		return true;
	},

	_parseArticles: function(html) {
		var doc = cinder.parseHTML(html);
		var articles = doc.querySelectorAll("article.post");
		var results = [];

		for (var i = 0; i < articles.length; i++) {
			try {
				var article = articles[i];
				
				// Chercher le lien de l'image
				var imgLink = article.querySelector("a.wp-post-image-link");
				if (!imgLink) continue;
				
				var bookUrl = this._absUrl(imgLink.attr("href") || "");
				if (!bookUrl || bookUrl.indexOf(this._BASE_URL) !== 0) continue;
				
				// Filtrer les URLs non-livres
				var path = bookUrl.replace(this._BASE_URL, "");
				if (path.indexOf("/page/") === 0 || 
				    path.indexOf("/category/") === 0 || 
				    path.indexOf("/tag/") === 0 ||
				    path.indexOf("/author/") === 0) continue;

				// Chercher le titre
				var titleLink = article.querySelector("h2.entry-title a");
				var title = titleLink ? this._clean(titleLink.text()) : "";
				if (!title) {
					// Extraire du slug URL
					var slugMatch = path.match(/\/([^\/]+)\/?$/);
					title = slugMatch ? slugMatch[1].replace(/-/g, " ") : "Sin título";
				}

				// Chercher l'image
				var img = article.querySelector("img.wp-post-image") || article.querySelector("img");
				var cover = "";
				if (img) {
					cover = img.attr("data-src") || img.attr("src") || "";
					cover = this._absUrl(cover);
				}

				// Chercher l'auteur
				var authorLink = article.querySelector("span.meta-author a");
				var author = authorLink ? this._clean(authorLink.text()) : "Desconocido";

				// Extraire l'ID
				var idMatch = path.match(/\/([^\/]+)\/?$/);
				var bookId = idMatch ? idMatch[1] : String(i);

				results.push({
					id: "lp6_" + bookId,
					title: title,
					author: author,
					cover: cover || undefined,
					url: bookUrl,
					source: "Lectuepub Libre",
					extra: {
						bookUrl: bookUrl,
						bookId: bookId,
					},
				});
			} catch (err) {
				cinder.warn("[LectuepubLibre6] Failed to parse article: " + err);
			}
		}

		return results;
	},

	search: async function(query, page) {
		page = page || 0;
		var url = page > 0
			? this._BASE_URL + "/page/" + (page + 1) + "/?s=" + encodeURIComponent(query)
			: this._BASE_URL + "/?s=" + encodeURIComponent(query);
		
		cinder.log("[LectuepubLibre6] Search: " + url);
		
		var resp = await this._fetchPage(url);
		if (!resp || !this._isUsableHtml(resp)) return [];
		
		return this._parseArticles(resp.data);
	},

	getDiscoverSections: async function() {
		return [
			{ id: "novedades", title: "Novedades", icon: "⏰" },
			{ id: "populares", title: "Populares", icon: "🔥" },
		];
	},

	getDiscoverItems: async function(sectionId, page) {
		page = page || 0;
		var url = this._BASE_URL + "/page/" + (page + 1) + "/";
		
		var resp = await this._fetchPage(url);
		if (!resp || !this._isUsableHtml(resp)) return [];
		
		return this._parseArticles(resp.data);
	},

	resolve: async function(item) {
		if (!item || !item.extra || !item.extra.bookUrl) {
			throw new Error("URL du livre manquante");
		}

		var resp = await this._fetchPage(item.extra.bookUrl);
		if (!resp || !this._isUsableHtml(resp)) {
			throw new Error("Page inaccessible");
		}

		var html = resp.data;
		var downloadUrl = null;
		var fileFormat = "epub";

		// Chercher les liens de téléchargement avec des patterns
		var patterns = [
			/href=["'](https?:\/\/send\.now\/[^"']+)["']/i,
			/href=["'](https?:\/\/www\.upload\.ee\/[^"']+)["']/i,
			/href=["'](https?:\/\/krakenfiles\.com\/[^"']+)["']/i,
			/href=["'](https?:\/\/ey43\.com\/[^"']+)["']/i,
			/href=["']([^"']+\.epub[^"']*)["']/i,
			/href=["']([^"']+\.pdf[^"']*)["']/i,
		];

		for (var i = 0; i < patterns.length; i++) {
			var match = html.match(patterns[i]);
			if (match) {
				downloadUrl = match[1].startsWith("http") ? match[1] : this._absUrl(match[1]);
				if (match[1].toLowerCase().includes(".pdf")) fileFormat = "pdf";
				break;
			}
		}

		if (!downloadUrl) {
			throw new Error("Lien de téléchargement non trouvé");
		}

		var fileName = this._clean(item.title || "libro")
			.replace(/[\\/:*?"<>|]+/g, " ") + "." + fileFormat;

		return {
			url: downloadUrl,
			fileName: fileName,
			headers: {
				Referer: item.extra.bookUrl,
			},
		};
	},
};

// LectuepubLibre6 — Debug version avec fetchBrowser

__cinderExport = {
	id: "lectuepub6",
	name: "Lectuepub Libre",
	version: "1.0.9",
	icon: "📚",
	description: "Descargar libros EPUB y PDF gratis en español",
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
		if (url.indexOf("http") === 0) return url;
		if (url.charAt(0) === "/") return this._BASE_URL + url;
		return this._BASE_URL + "/" + url;
	},

	_clean: function(value) {
		if (typeof cinder !== "undefined" && cinder.normalizeText) {
			return cinder.normalizeText(String(value || ""));
		}
		return String(value || "")
			.replace(/<[^>]+>/g, "")
			.replace(/\s+/g, " ")
			.trim();
	},

	// Essayer fetch normal d'abord, puis fetchBrowser si échec
	_fetchWithFallback: async function(url) {
		cinder.log("[LectuepubLibre6] Fetching: " + url);
		
		// Essayer fetch normal
		try {
			var resp = await cinder.fetch(url, {
				headers: {
					"Accept": "text/html,*/*",
					"Accept-Language": "es-ES,es;q=0.9",
					"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
				},
				timeout: 30000,
			});
			if (resp && resp.status === 200 && resp.data && resp.data.length > 1000) {
				cinder.log("[LectuepubLibre6] Fetch normal OK, length: " + resp.data.length);
				return resp;
			}
		} catch (e) {
			cinder.log("[LectuepubLibre6] Fetch normal failed: " + e);
		}

		// Fallback sur fetchBrowser
		cinder.log("[LectuepubLibre6] Trying fetchBrowser...");
		try {
			var browserResp = await cinder.fetchBrowser(url, {
				timeout: 60000,
			});
			cinder.log("[LectuepubLibre6] fetchBrowser OK, length: " + (browserResp.data ? browserResp.data.length : 0));
			return browserResp;
		} catch (e) {
			cinder.log("[LectuepubLibre6] fetchBrowser failed: " + e);
		}
		
		return null;
	},

	search: async function(query, page) {
		var q = String(query || "").trim();
		if (!q) return [];
		
		page = page || 0;
		var url = page > 0
			? this._BASE_URL + "/page/" + (page + 1) + "/?s=" + encodeURIComponent(q)
			: this._BASE_URL + "/?s=" + encodeURIComponent(q);
		
		cinder.log("[LectuepubLibre6] Search URL: " + url);
		
		var resp = await this._fetchWithFallback(url);
		if (!resp || !resp.data) {
			cinder.log("[LectuepubLibre6] No response data");
			return [];
		}

		var html = resp.data;
		cinder.log("[LectuepubLibre6] HTML length: " + html.length);
		
		// Chercher un extrait pour debug
		var excerpt = html.substring(html.indexOf("<article"), html.indexOf("<article") + 500);
		cinder.log("[LectuepubLibre6] Article excerpt: " + excerpt);

		var results = [];
		
		// Méthode 1: Utiliser cinder.parseHTML
		try {
			var doc = cinder.parseHTML(html);
			var articles = doc.querySelectorAll("article");
			cinder.log("[LectuepubLibre6] Found " + articles.length + " articles with querySelectorAll");
			
			for (var i = 0; i < articles.length; i++) {
				var article = articles[i];
				
				// Chercher le lien principal
				var link = article.querySelector("a[rel='bookmark']") || 
				           article.querySelector("h2 a") ||
				           article.querySelector(".entry-title a") ||
				           article.querySelector("a");
				
				if (!link) continue;
				
				var bookUrl = this._absUrl(link.attr("href") || "");
				var title = this._clean(link.text());
				
				if (!bookUrl || !title) continue;
				if (bookUrl.indexOf("/page/") > -1) continue;
				if (bookUrl.indexOf("/category/") > -1) continue;
				
				// Image
				var img = article.querySelector("img");
				var cover = img ? this._absUrl(img.attr("src") || img.attr("data-src") || "") : "";
				
				// Auteur
				var authorEl = article.querySelector(".meta-author a") || article.querySelector(".author");
				var author = authorEl ? this._clean(authorEl.text()) : "Desconocido";
				
				results.push({
					id: "lp6_" + i,
					title: title,
					author: author,
					cover: cover || undefined,
					url: bookUrl,
					source: "Lectuepub Libre",
					extra: { bookUrl: bookUrl }
				});
			}
		} catch (e) {
			cinder.log("[LectuepubLibre6] parseHTML error: " + e);
		}
		
		// Méthode 2: Si échec, utiliser regex simple
		if (results.length === 0) {
			cinder.log("[LectuepubLibre6] Trying regex method...");
			var regex = /href=["'](https?:\/\/lectuepublibre6\.com\/[^"']+)["'][^>]*>[\s\S]*?<h2[^>]*>([^<]+)</gi;
			var match;
			var seen = {};
			while ((match = regex.exec(html)) !== null) {
				var url = match[1];
				var title = this._clean(match[2]);
				
				if (seen[url]) continue;
				if (url.includes("/page/") || url.includes("/category/")) continue;
				if (title.length < 3) continue;
				
				seen[url] = true;
				results.push({
					id: "lp6_" + results.length,
					title: title,
					author: "Desconocido",
					url: url,
					source: "Lectuepub Libre",
					extra: { bookUrl: url }
				});
			}
		}

		cinder.log("[LectuepubLibre6] Found " + results.length + " results");
		return results;
	},

	getDiscoverSections: async function() {
		return [{ id: "latest", title: "Últimos", icon: "⏰" }];
	},

	getDiscoverItems: async function(sectionId, page) {
		page = page || 0;
		var url = this._BASE_URL + "/page/" + (page + 1) + "/";
		var resp = await this._fetchWithFallback(url);
		if (!resp || !resp.data) return [];
		
		// Réutiliser la logique de search
		return this.search("", 0);
	},

	resolve: async function(item) {
		if (!item || !item.extra || !item.extra.bookUrl) {
			throw new Error("URL manquante");
		}

		var resp = await this._fetchWithFallback(item.extra.bookUrl);
		if (!resp || !resp.data) {
			throw new Error("Page inaccessible");
		}

		var html = resp.data;
		var downloadUrl = null;
		var fileFormat = "epub";

		var patterns = [
			/send\.now\/[^"'\s]+/i,
			/upload\.ee\/[^"'\s]+/i,
			/krakenfiles\.com\/[^"'\s]+/i,
			/ey43\.com\/[^"'\s]+/i,
			/\.epub[^"'\s]*/i,
			/\.pdf[^"'\s]*/i,
		];

		for (var i = 0; i < patterns.length; i++) {
			var match = html.match(patterns[i]);
			if (match) {
				downloadUrl = match[0].startsWith("http") ? match[0] : "https://" + match[0];
				if (match[0].toLowerCase().includes(".pdf")) fileFormat = "pdf";
				break;
			}
		}

		if (!downloadUrl) {
			throw new Error("Lien non trouvé");
		}

		return {
			url: downloadUrl,
			fileName: this._clean(item.title) + "." + fileFormat,
			headers: { Referer: item.extra.bookUrl }
		};
	},
};

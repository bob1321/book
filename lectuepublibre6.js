// ==========================================
// LectuepubLibre6 Source for Cinder Reader
// Language: Spanish (es)
// Format: EPUB/PDF
// ==========================================

const Source = {
    // Source metadata
    id: 'lectuepublibre6',
    name: 'Lectuepub Libre',
    language: 'es',
    version: '1.0.0',
    baseUrl: 'https://lectuepublibre6.com',
    
    // Icon (optional)
    icon: 'https://lectuepublibre6.com/favicon.ico',
    
    // ==========================================
    // SEARCH FUNCTION
    // ==========================================
    async search(query, page = 1) {
        const searchUrl = `${this.baseUrl}/page/${page}/?s=${encodeURIComponent(query)}&post_type=post`;
        
        try {
            const response = await fetch(searchUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const results = [];
            const articles = doc.querySelectorAll('article.post, .post-item, .book-item, .entry');
            
            articles.forEach(article => {
                const titleElement = article.querySelector('h2 a, .entry-title a, h3 a');
                const coverElement = article.querySelector('img');
                const linkElement = article.querySelector('a');
                
                if (titleElement && linkElement) {
                    results.push({
                        id: this.extractId(linkElement.href),
                        title: titleElement.textContent.trim(),
                        cover: coverElement ? coverElement.src : '',
                        url: linkElement.href,
                        author: this.extractAuthor(article)
                    });
                }
            });
            
            return {
                results: results,
                hasNextPage: this.hasNextPage(doc)
            };
        } catch (error) {
            console.error('Search error:', error);
            return { results: [], hasNextPage: false };
        }
    },
    
    // ==========================================
    // GET BOOK DETAILS
    // ==========================================
    async getBookDetails(bookId) {
        const bookUrl = `${this.baseUrl}/libro/${bookId}`;
        
        try {
            const response = await fetch(bookUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract metadata
            const title = doc.querySelector('h1.entry-title, h1.post-title, .book-title')?.textContent?.trim() || '';
            const author = doc.querySelector('.author, .book-author, [rel="author"]')?.textContent?.trim() || 'Desconocido';
            const description = doc.querySelector('.entry-content p, .book-description, .summary')?.textContent?.trim() || '';
            const cover = doc.querySelector('.book-cover img, .entry-content img')?.src || '';
            
            // Extract download links
            const downloads = [];
            const downloadLinks = doc.querySelectorAll('a[href*=".epub"], a[href*=".pdf"], .download-link, a[href*="download"]');
            
            downloadLinks.forEach(link => {
                const format = link.href.includes('.pdf') ? 'pdf' : 'epub';
                downloads.push({
                    url: link.href,
                    format: format,
                    quality: 'standard'
                });
            });
            
            // Alternative: look for buttons or specific download sections
            const buttons = doc.querySelectorAll('.btn, .button, [class*="download"]');
            buttons.forEach(btn => {
                const href = btn.getAttribute('href') || btn.closest('a')?.href;
                if (href && (href.includes('.epub') || href.includes('.pdf'))) {
                    const format = href.includes('.pdf') ? 'pdf' : 'epub';
                    if (!downloads.find(d => d.url === href)) {
                        downloads.push({
                            url: href,
                            format: format,
                            quality: 'standard'
                        });
                    }
                }
            });
            
            return {
                id: bookId,
                title: title,
                author: author,
                description: description,
                cover: cover,
                language: 'es',
                downloads: downloads
            };
        } catch (error) {
            console.error('Book details error:', error);
            return null;
        }
    },
    
    // ==========================================
    // GET POPULAR/LATEST BOOKS
    // ==========================================
    async getPopularBooks(page = 1) {
        const popularUrl = `${this.baseUrl}/page/${page}/`;
        
        try {
            const response = await fetch(popularUrl);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            const results = [];
            const articles = doc.querySelectorAll('article.post, .post-item, .book-item');
            
            articles.forEach(article => {
                const titleElement = article.querySelector('h2 a, .entry-title a, h3 a');
                const coverElement = article.querySelector('img');
                
                if (titleElement) {
                    results.push({
                        id: this.extractId(titleElement.href),
                        title: titleElement.textContent.trim(),
                        cover: coverElement ? coverElement.src : '',
                        url: titleElement.href
                    });
                }
            });
            
            return {
                results: results,
                hasNextPage: this.hasNextPage(doc)
            };
        } catch (error) {
            console.error('Popular books error:', error);
            return { results: [], hasNextPage: false };
        }
    },
    
    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
    extractId(url) {
        // Extract book ID from URL
        // Example: https://lectuepublibre6.com/libro/nombre-del-libro/
        const match = url.match(/\/libro\/([^\/]+)\/?/);
        return match ? match[1] : url;
    },
    
    extractAuthor(article) {
        // Try to find author in the article
        const authorElement = article.querySelector('.author, .book-author, [rel="author"]');
        return authorElement ? authorElement.textContent.trim() : 'Desconocido';
    },
    
    hasNextPage(doc) {
        // Check if there's a next page
        const nextLink = doc.querySelector('.next, .pagination .next, a[rel="next"]');
        return !!nextLink;
    },
    
    // ==========================================
    // DOWNLOAD HANDLER
    // ==========================================
    async getDownloadUrl(bookId, format = 'epub') {
        const details = await this.getBookDetails(bookId);
        if (!details || !details.downloads) return null;
        
        // Return the requested format, or first available
        const download = details.downloads.find(d => d.format === format) || details.downloads[0];
        return download ? download.url : null;
    }
};

// Export for Cinder
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Source;
}
__cinderExport = lectuepublibre6;

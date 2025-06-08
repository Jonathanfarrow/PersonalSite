export class ListingPage {
    constructor(contentManager) {
        this.contentManager = contentManager;
    }

    async render(section) {
        const articles = await this.contentManager.markdownLoader.loadDirectory(`content/${section}`);
        return `
            <div class="listing-page">
                <h2>All ${section.charAt(0).toUpperCase() + section.slice(1)}</h2>
                <div class="articles-grid">
                    ${articles.map(article => `
                        <article class="article-card" onclick="window.location.hash = 'read/${section}/${article.path}'">
                            <h3>${article.metadata.title || 'Untitled'}</h3>
                            ${article.metadata.subtitle ? `<p class="subtitle">${article.metadata.subtitle}</p>` : ''}
                            ${article.metadata.tags && article.metadata.tags.length > 0 ? `
                                <div class="tags">
                                    ${article.metadata.tags.map(tag => `
                                        <span class="tag">${tag}</span>
                                    `).join('')}
                                </div>
                            ` : ''}
                            <div class="preview">
                                ${this.generatePreview(article.content)}
                            </div>
                            ${article.date ? `<div class="date">${this.formatDate(article.date)}</div>` : ''}
                        </article>
                    `).join('')}
                </div>
            </div>
        `;
    }

    generatePreview(content) {
        const plainText = content.replace(/<[^>]*>/g, '');
        return plainText.length > 150 ? 
            plainText.substring(0, 150) + '...' : 
            plainText;
    }

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
} 
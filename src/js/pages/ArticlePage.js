export class ArticlePage {
    constructor(contentManager) {
        this.contentManager = contentManager;
    }

    async render(section, filename) {
        const article = await this.contentManager.markdownLoader.loadMarkdown(`content/${section}/${filename}`);
        return `
            <div class="article-page">
                <div class="article-header">
                    <a href="#${section}" class="back-link">← Back to ${section}</a>
                    <h1>${article.metadata.title}</h1>
                    ${article.metadata.subtitle ? `<p class="subtitle">${article.metadata.subtitle}</p>` : ''}
                    ${article.metadata.tags && article.metadata.tags.length > 0 ? `
                        <div class="tags">
                            ${article.metadata.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="article-content">
                    ${article.content}
                </div>
            </div>
        `;
    }
} 
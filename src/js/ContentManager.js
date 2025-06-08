import { MarkdownLoader } from './MarkdownLoader.js';
import { HomePage } from './pages/HomePage.js';
import { ListingPage } from './pages/ListingPage.js';
import { ArticlePage } from './pages/ArticlePage.js';
import { AboutPage } from './pages/AboutPage.js';

export class ContentManager {
    constructor() {
        console.log('ContentManager initializing...');
        this.contentElement = document.querySelector('#content');
        this.markdownLoader = new MarkdownLoader();
        
        // Initialize pages
        this.pages = {
            home: new HomePage(this),
            listing: new ListingPage(this),
            article: new ArticlePage(this),
            about: new AboutPage(this)
        };

        this.setupNavigationHandlers();
        this.handleHashChange();
    }

    setupNavigationHandlers() {
        // Handle navigation links
        document.querySelectorAll('nav a, .view-all').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = e.target.getAttribute('href');
                if (href === '#home') {
                    window.location.hash = '';
                    return;
                }
                window.location.hash = href.substring(1);
            });
        });

        // Handle browser back/forward buttons and initial load
        window.addEventListener('hashchange', () => this.handleHashChange());
    }

    async handleHashChange() {
        const hash = window.location.hash.substring(1);
        this.showLoading();

        try {
            let content;
            const heroContent = document.querySelector('.hero-content');
            const mainContent = document.querySelector('main.content');
            const homeGrid = document.querySelector('.content-grid');
            
            if (!hash || hash === 'home') {
                if (heroContent) heroContent.style.display = 'block';
                if (homeGrid) homeGrid.style.display = 'grid';
                if (mainContent) mainContent.classList.remove('content-above');
                content = await this.pages.home.render();
                this.contentElement.innerHTML = content;
                await this.pages.home.afterRender();
            } else {
                if (heroContent) heroContent.style.display = 'none';
                if (homeGrid) homeGrid.style.display = 'none';
                if (mainContent) mainContent.classList.add('content-above');
                
                if (hash.startsWith('read/')) {
                    const [_, section, filename] = hash.split('/');
                    content = await this.pages.article.render(section, filename);
                } else if (hash === 'essays' || hash === 'technical') {
                    content = await this.pages.listing.render(hash);
                } else if (hash === 'about') {
                    content = await this.pages.about.render();
                }
                this.contentElement.innerHTML = content;
            }
        } catch (error) {
            console.error('Error loading content:', error);
            this.showError('Failed to load content');
        }
    }

    showLoading() {
        if (this.contentElement) {
            this.contentElement.innerHTML = '<div class="loading">Loading content...</div>';
        }
    }

    showError(message) {
        this.contentElement.innerHTML = `
            <div class="error">
                ${message}. Please try again later.
            </div>
        `;
    }

    async loadLatestContent() {
        try {
            console.log('Loading latest content...');
            // Load latest essays
            const latestEssaysContainer = document.querySelector('#latest-essays .articles-container');
            console.log('Loading essays from GitHub...');
            const essays = await this.markdownLoader.loadDirectory('content/essays');
            console.log('Essays loaded:', essays);
            latestEssaysContainer.innerHTML = this.renderLatestArticles(essays.slice(0, 2));

            // Load latest technical articles
            const latestTechnicalContainer = document.querySelector('#latest-technical .articles-container');
            console.log('Loading technical articles from GitHub...');
            const technical = await this.markdownLoader.loadDirectory('content/technical');
            console.log('Technical articles loaded:', technical);
            latestTechnicalContainer.innerHTML = this.renderLatestArticles(technical.slice(0, 2));
        } catch (error) {
            console.error('Error loading latest content:', error);
            const containers = document.querySelectorAll('.articles-container');
            containers.forEach(container => {
                container.innerHTML = `
                    <div class="error">
                        Error loading content. Please make sure the GitHub repository is accessible.
                    </div>`;
            });
        }
    }

    renderLatestArticles(articles) {
        if (articles.length === 0) {
            return '<p class="empty-message">No articles found.</p>';
        }

        return articles.map(article => `
            <article class="article" onclick="window.location.hash = 'read/${article.type.replace('content/', '')}/${article.path}'">
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
        `).join('');
    }

    generatePreview(content) {
        // Remove HTML tags and get first paragraph or first 200 characters
        const textContent = content.replace(/<[^>]*>/g, '');
        const firstParagraph = textContent.split('\n')[0];
        return firstParagraph.length > 200 ? 
            firstParagraph.substring(0, 200) + '...' : 
            firstParagraph;
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
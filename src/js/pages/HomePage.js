export class HomePage {
    constructor(contentManager) {
        this.contentManager = contentManager;
    }

    async render() {
        // Return empty string since the home page content is already in index.html
        return '';
    }

    async afterRender() {
        // Load latest content after the page is rendered
        await this.contentManager.loadLatestContent();
    }
} 
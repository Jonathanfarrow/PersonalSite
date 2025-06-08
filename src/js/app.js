import { ContentManager } from './ContentManager.js';

class App {
    constructor() {
        this.setupContent();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onResize());
        
        // Handle navigation to show/hide background
        window.addEventListener('hashchange', () => this.handleNavigation());
    }

    onResize() {
        // Handle resize if needed
    }

    handleNavigation() {
        // Handle navigation if needed
    }

    setupContent() {
        this.contentManager = new ContentManager();
    }
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
}); 
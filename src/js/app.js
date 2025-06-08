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

function positionHeroContent() {
    const watercolorImg = document.querySelector('.watercolor-img');
    const heroContent = document.querySelector('.hero-content');
    
    if (!watercolorImg || !heroContent) return;

    // Get the watercolor image's dimensions and position
    const imgRect = watercolorImg.getBoundingClientRect();
    
    // Calculate the position where the blue section is
    // These values can be adjusted based on the exact position of the blue section
    const blueSection = {
        top: imgRect.height * 0.45,  // Adjust this multiplier to match blue section
        left: imgRect.width * 0.5
    };
    
    // Position the hero content relative to the blue section
    heroContent.style.position = 'absolute';
    heroContent.style.top = `${blueSection.top}px`;
    heroContent.style.left = '50%';
    heroContent.style.transform = 'translate(-50%, -50%)';
}

// Call on load and resize
window.addEventListener('load', positionHeroContent);
window.addEventListener('resize', positionHeroContent);

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
}); 
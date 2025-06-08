export class AboutPage {
    constructor(contentManager) {
        this.contentManager = contentManager;
    }

    async render() {
        return `
            <div class="about-page">
                <div class="about-header">
                    <h1>About Me</h1>
                    <div class="profile">
                        <img src="src/assets/me.jpg" alt="Jonathan Farrow" class="profile-image">
                        <div class="social-links">
                            <a href="https://github.com/Jonathanfarrow" target="_blank" class="social-link">GitHub</a>
                            <a href="https://twitter.com/farrow_jonny" target="_blank" class="social-link">Twitter</a>
                            <a href="https://de.linkedin.com/in/jonathan-farrow-9747b7bb" target="_blank" class="social-link">LinkedIn</a>
                        </div>
                    </div>
                </div>
                
                <div class="about-content">
                    <section class="about-section">
                        <h2>Background</h2>
                        <p>
                            I'm an engineer with a deep interest in both hardware and software systems. 
                            My work explores the intersection of these technologies and their broader impact on society.
                            I'm particularly fascinated by how these systems shape and influence our world.
                        </p>
                    </section>

                    <section class="about-section">
                        <h2>What I Write About</h2>
                        <p>
                            My writing examines technology through two lenses:
                        </p>
                        <ul>
                            <li>
                                <strong>Essays:</strong> Exploring the broader context of hardware and software in society, 
                                examining how these technologies influence our lives and shape our future.
                            </li>
                            <li>
                                <strong>Technical:</strong> Deep dives into hardware and software systems, 
                                analyzing their architecture, implementation, and real-world applications.
                            </li>
                        </ul>
                    </section>

                    <section class="about-section">
                        <h2>Get in Touch</h2>
                        <p>
                            I'm always interested in connecting with fellow engineers and thinkers. 
                            Feel free to reach out through any of the social links above or email me at 
                            <a href="mailto:jonathanjamesf@gmail.com">jonathanjamesf@gmail.com</a>.
                        </p>
                    </section>
                </div>
            </div>
        `;
    }
} 
import { marked } from '/node_modules/marked/lib/marked.esm.js';

export class MarkdownLoader {
    constructor() {
        this.cache = new Map();
        // Configure marked options
        marked.setOptions({
            highlight: function(code, lang) {
                // If a language is specified and Prism supports it
                if (lang && window.Prism.languages[lang]) {
                    return window.Prism.highlight(code, window.Prism.languages[lang], lang);
                }
                return code; // Return raw code if language not supported
            },
            breaks: true,
            gfm: true
        });
    }

    async loadMarkdown(path) {
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        try {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const result = this.parseMarkdown(text);
            this.cache.set(path, result);
            return result;
        } catch (error) {
            console.error('Error loading markdown:', error);
            throw error;
        }
    }

    async loadDirectory(section) {
        try {
            const response = await fetch(`${section}/index.json`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const files = await response.json();
            
            // Load each markdown file
            return Promise.all(
                files.map(async file => {
                    const content = await this.loadMarkdown(`${section}/${file.name}`);
                    return {
                        path: file.name,
                        ...content,
                        type: section,
                        date: this.extractDateFromFilename(file.name)
                    };
                })
            );
        } catch (error) {
            console.error('Error loading directory:', error);
            throw error;
        }
    }

    parseMarkdown(text) {
        const lines = text.split('\n');
        const metadata = {
            title: '',
            subtitle: '',
            tags: []
        };

        let contentStartIndex = 0;
        let inFrontmatter = false;

        // Parse frontmatter
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === '---') {
                if (!inFrontmatter) {
                    inFrontmatter = true;
                    contentStartIndex = i + 1;
                    continue;
                } else {
                    inFrontmatter = false;
                    contentStartIndex = i + 1;
                    break;
                }
            }

            if (inFrontmatter) {
                if (line.startsWith('title:')) {
                    const titleMatch = line.match(/title:\s*(.+)/);
                    if (titleMatch) {
                        metadata.title = titleMatch[1].trim();
                    }
                } else if (line.startsWith('subtitle:')) {
                    const subtitleMatch = line.match(/subtitle:\s*(.+)/);
                    if (subtitleMatch) {
                        metadata.subtitle = subtitleMatch[1].trim();
                    }
                } else if (line.startsWith('tags:')) {
                    const tagsMatch = line.match(/tags:\s*(.+)/);
                    if (tagsMatch) {
                        metadata.tags = tagsMatch[1].trim().split(' ').filter(tag => tag.startsWith('#'));
                    }
                }
            }
        }

        // Get the actual content (everything after frontmatter)
        const rawContent = lines.slice(contentStartIndex).join('\n').trim();
        
        // Convert markdown to HTML
        const content = marked.parse(rawContent);

        return { content, metadata };
    }

    extractDateFromFilename(filename) {
        // Extract date from filenames like: 2024-03-20-article-name.md
        const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : null;
    }
} 
import { marked } from '/node_modules/marked/lib/marked.esm.js';

export class MarkdownLoader {
    constructor() {
        this.cache = new Map();
        this.baseUrl = 'https://raw.githubusercontent.com/Jonathanfarrow/Thoughts/main';
        this.apiUrl = 'https://api.github.com/repos/Jonathanfarrow/Thoughts/contents';
    }

    async loadMarkdown(path) {
        if (this.cache.has(path)) {
            return this.cache.get(path);
        }

        try {
            const response = await fetch(`${this.baseUrl}/${path}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            console.log('Raw markdown text:', text); // Debug log
            const { content, metadata } = this.parseMarkdown(text);
            console.log('Parsed metadata:', metadata); // Debug log
            console.log('Parsed content:', content); // Debug log
            const result = {
                content: marked.parse(content),
                metadata
            };
            this.cache.set(path, result);
            return result;
        } catch (error) {
            console.error('Error loading markdown:', error);
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

        // Parse frontmatter
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line.startsWith('title:')) {
                const titleMatch = line.match(/title:\s*#(.+)/);
                if (titleMatch) {
                    metadata.title = titleMatch[1].trim();
                }
                contentStartIndex = i + 1;
            } else if (line.startsWith('subtitle:')) {
                const subtitleMatch = line.match(/subtitle:\s*(.+)/);
                if (subtitleMatch) {
                    metadata.subtitle = subtitleMatch[1].trim();
                }
                contentStartIndex = i + 1;
            } else if (line.startsWith('tags:')) {
                const tagsMatch = line.match(/tags:\s*(.+)/);
                if (tagsMatch) {
                    // Keep the hashtags by not splitting and filtering
                    metadata.tags = tagsMatch[1].trim().split(' ').filter(tag => tag.startsWith('#'));
                }
                contentStartIndex = i + 1;
            } else if (line === '') {
                // Empty line after frontmatter
                contentStartIndex = i + 1;
                continue;
            }
        }

        console.log('Parsing results:', { // Debug log
            metadata,
            contentStartIndex,
            firstContentLines: lines.slice(contentStartIndex, contentStartIndex + 5)
        });

        // Get the actual content (everything after frontmatter)
        const content = lines.slice(contentStartIndex).join('\n').trim();

        return { content, metadata };
    }

    async loadDirectory(section) {
        try {
            const response = await fetch(`${this.apiUrl}/${section}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const files = await response.json();
            
            // Filter for markdown files and sort by name (assuming date-based filenames)
            const markdownFiles = files
                .filter(file => file.name.toLowerCase().endsWith('.md') && file.type === 'file')
                .sort((a, b) => b.name.localeCompare(a.name)); // Sort newest first

            // Load each markdown file
            return Promise.all(
                markdownFiles.map(async file => {
                    const content = await this.loadMarkdown(`${section}/${file.name}`);
                    return {
                        path: file.name,
                        ...content,
                        date: this.extractDateFromFilename(file.name)
                    };
                })
            );
        } catch (error) {
            console.error('Error loading directory:', error);
            throw error;
        }
    }

    extractDateFromFilename(filename) {
        // Extract date from filenames like: 2024-03-20-article-name.md
        const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : null;
    }
} 
// The side sheet that shows what is in each room.
import { MarkdownLoader } from '../MarkdownLoader.js';

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u = '') => (/^(https?:|mailto:|\/|\.\/|[\w-]+\/)/i.test(u) && !/^javascript:/i.test(u) ? esc(u) : '#');
const external = (u = '') => (/^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : '');
const cleanTitle = (t = '') => {
    const s = t.replace(/^#+\s*/, '').trim() || 'Untitled';
    return s.charAt(0).toUpperCase() + s.slice(1);
};
const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

const WRITING_SECTIONS = [
    { id: 'essays', label: 'Essays' },
    { id: 'technical', label: 'Technical' },
];

export class Panel {
    constructor(el, site) {
        this.el = el;
        this.body = el.querySelector('.panel-body');
        this.site = site;
        this.markdown = new MarkdownLoader();
        this.renderToken = 0;
    }

    head(room) {
        const d = this.site[room];
        return `
            <header class="panel-head">
                <p class="eyebrow">${esc(d.floor)}</p>
                <h2 tabindex="-1">${esc(d.title)}</h2>
                <p class="lede">${esc(d.intro)}</p>
            </header>`;
    }

    /** Renders the panel for a route. Returns once content is in the DOM. */
    async show(route) {
        const token = ++this.renderToken;
        // Re-render only when the view changes, so a playing track survives a new selection.
        const view = [route.room, route.article ? `${route.article.section}/${route.article.file}` : route.room === 'office' ? route.sub || 'work' : ''].join('|');
        if (view !== this.view) {
            let html;
            if (route.article) html = await this.article(route.article);
            else if (route.room === 'studio') html = this.studio();
            else if (route.room === 'games') html = this.games();
            else html = await this.office(route.sub || 'work');
            if (token !== this.renderToken) return;
            this.view = view;
            this.el.classList.toggle('is-reader', !!route.article);
            this.body.innerHTML = html;
            this.body.scrollTop = 0;
            if (route.article && window.Prism) window.Prism.highlightAllUnder(this.body);
            this.wireAudio();
        }
        this.select(route);
    }

    select(route) {
        this.body.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
        if (route.article || route.room === 'office' || route.sub === undefined || route.sub === '') return;
        const item = this.body.querySelector(`[data-item="${CSS.escape(route.sub)}"]`);
        if (!item) return;
        item.classList.add('is-selected');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    wireAudio() {
        const players = [...this.body.querySelectorAll('audio')];
        players.forEach((a) => a.addEventListener('play', () => players.forEach((b) => b !== a && b.pause())));
    }

    stopAudio() {
        this.body.querySelectorAll('audio').forEach((a) => a.pause());
    }

    studio() {
        const tracks = this.site.studio.tracks ?? [];
        return this.head('studio') + `
            <ol class="items tracks">
                ${tracks.map((t, i) => `
                    <li class="item track${t.spotify ? ' has-embed' : ''}" data-item="${i}">
                        <a class="sleeve ${t.sleeve === 'mono' ? 'sleeve-mono' : `sleeve-${i % 6}`}" href="#studio/${i}" aria-label="Select ${esc(t.title)}">
                            ${t.cover ? `<img src="${safeUrl(t.cover)}" alt="">` : ''}
                        </a>
                        <div class="item-main">
                            <h3>${esc(t.title)}</h3>
                            ${t.artist || t.year ? `<p class="meta">${[t.artist, t.year].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
                            ${t.note ? `<p>${esc(t.note)}</p>` : ''}
                            ${t.audio ? `<audio controls preload="none" src="${safeUrl(t.audio)}"></audio>` : ''}
                            ${!t.spotify && t.url ? `<a class="btn" href="${safeUrl(t.url)}"${external(t.url)}>Listen</a>` : ''}
                            ${!t.audio && !t.url && !t.spotify ? '<p class="meta">Audio coming soon</p>' : ''}
                        </div>
                        ${t.spotify && /^[A-Za-z0-9]+$/.test(t.spotify) ? `
                            <iframe class="spotify" title="${esc(t.title)} on Spotify" loading="lazy"
                                src="https://open.spotify.com/embed/track/${t.spotify}?theme=0"
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
                            <a class="btn ghost" href="${safeUrl(t.url || `https://open.spotify.com/track/${t.spotify}`)}" target="_blank" rel="noopener">Open in Spotify</a>` : ''}
                    </li>`).join('')}
            </ol>`;
    }

    games() {
        const games = this.site.games.games ?? [];
        return this.head('games') + `
            <ol class="items">
                ${games.map((g, i) => `
                    <li class="item game" data-item="${i}">
                        ${g.image ? `<img class="shot" src="${safeUrl(g.image)}" alt="Screenshot of ${esc(g.title)}">` : ''}
                        <div class="item-main">
                            <h3>${esc(g.title)} ${g.status ? `<span class="badge">${esc(g.status)}</span>` : ''}</h3>
                            ${g.description ? `<p>${esc(g.description)}</p>` : ''}
                            <p class="actions">
                                ${g.playUrl ? `<a class="btn" href="${safeUrl(g.playUrl)}"${external(g.playUrl)}>Play</a>` : ''}
                                ${g.url ? `<a class="btn ghost" href="${safeUrl(g.url)}"${external(g.url)}>More</a>` : ''}
                            </p>
                        </div>
                    </li>`).join('')}
            </ol>`;
    }

    async office(tab) {
        const tabs = [['work', 'Work', '#office'], ['writing', 'Writing', '#office/writing'], ['about', 'About', '#office/about']];
        const nav = `
            <nav class="tabs" aria-label="Office sections">
                ${tabs.map(([id, label, href]) => `<a href="${href}"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
            </nav>`;
        let content;
        if (tab === 'writing') content = await this.writing();
        else if (tab === 'about') content = this.about();
        else content = this.work();
        return this.head('office') + nav + content;
    }

    work() {
        const projects = this.site.office.projects ?? [];
        return `
            <ol class="items">
                ${projects.map((p) => `
                    <li class="item">
                        <div class="item-main">
                            <h3>${esc(p.title)}</h3>
                            ${p.role || p.period ? `<p class="meta">${[p.role, p.period].filter(Boolean).map(esc).join(' · ')}</p>` : ''}
                            ${p.description ? `<p>${esc(p.description)}</p>` : ''}
                            ${p.tags?.length ? `<p class="tags">${p.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join('')}</p>` : ''}
                            ${p.url ? `<p class="actions"><a class="btn" href="${safeUrl(p.url)}"${external(p.url)}>View project</a></p>` : ''}
                        </div>
                    </li>`).join('')}
            </ol>`;
    }

    async writing() {
        const groups = await Promise.all(WRITING_SECTIONS.map(async (s) => {
            try {
                const posts = await this.markdown.loadDirectory(`content/${s.id}`);
                posts.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
                return { ...s, posts };
            } catch {
                return { ...s, posts: [] };
            }
        }));
        return groups.filter((g) => g.posts.length).map((g) => `
            <h3 class="group-title">${g.label}</h3>
            <ol class="items">
                ${g.posts.map((p) => `
                    <li class="item">
                        <a class="item-main post" href="#read/${g.id}/${encodeURIComponent(p.path)}">
                            <h3>${esc(cleanTitle(p.metadata.title))}</h3>
                            ${p.metadata.subtitle ? `<p>${esc(p.metadata.subtitle.trim())}</p>` : ''}
                            <p class="meta">${esc(formatDate(p.date))}</p>
                        </a>
                    </li>`).join('')}
            </ol>`).join('') || '<p class="meta">Nothing here yet.</p>';
    }

    about() {
        const a = this.site.about;
        return `
            <div class="about">
                ${a.photo ? `<img class="portrait" src="${safeUrl(a.photo)}" alt="${esc(this.site.name)}">` : ''}
                ${a.bio.map((p) => `<p>${esc(p)}</p>`).join('')}
                <p class="actions">
                    ${a.links.map((l) => `<a class="btn ghost" href="${safeUrl(l.url)}"${external(l.url)}>${esc(l.label)}</a>`).join('')}
                </p>
            </div>`;
    }

    async article({ section, file }) {
        const back = '<a class="back-link" href="#office/writing">← All writing</a>';
        if (!/^[\w-]+$/.test(section) || !/^[\w.-]+\.md$/.test(file)) return back + '<p>That page doesn\'t exist.</p>';
        try {
            const post = await this.markdown.loadMarkdown(`content/${section}/${file}`);
            const date = formatDate(this.markdown.extractDateFromFilename(file));
            return `
                ${back}
                <article class="prose">
                    <header>
                        <h2 tabindex="-1">${esc(cleanTitle(post.metadata.title))}</h2>
                        ${post.metadata.subtitle ? `<p class="lede">${esc(post.metadata.subtitle.trim())}</p>` : ''}
                        <p class="meta">${esc(date)}</p>
                    </header>
                    ${post.content}
                </article>`;
        } catch {
            return back + '<p>That piece couldn\'t be loaded.</p>';
        }
    }
}

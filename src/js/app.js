import { Panel } from './ui/Panel.js';

const ROOM_IDS = ['studio', 'office', 'games'];
const $ = (sel) => document.querySelector(sel);

/** '#studio/2' -> { room: 'studio', sub: '2' }. Old blog links still resolve. */
function parseRoute(hash) {
    const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [head, a, b] = parts;
    if (head === 'read' && a && b) return { room: 'office', article: { section: a, file: b } };
    if (head === 'about') return { room: 'office', sub: 'about' };
    if (head === 'essays' || head === 'technical') return { room: 'office', sub: 'writing' };
    if (ROOM_IDS.includes(head)) return { room: head, sub: a ?? '' };
    return { room: null };
}

/** What a clicked object in a room should open. */
function spotToHash(room, spotId) {
    const [kind, index] = spotId.split(':');
    if (room === 'office') return kind === 'work' ? '#office' : `#office/${kind}`;
    return index === undefined ? `#${room}` : `#${room}/${index}`;
}

async function start() {
    const site = await (await fetch('content/site.json')).json();
    const stage = $('#stage');
    const panelEl = $('#panel');
    const tooltip = $('#tooltip');
    const labels = new Map(ROOM_IDS.map((id) => [id, document.querySelector(`.room-label[data-room="${id}"]`)]));
    const panel = new Panel(panelEl, site);
    let route = { room: null };
    let world = null;

    document.title = site.name;
    $('#intro-name').textContent = site.name;
    $('#intro-tagline').textContent = site.tagline;
    $('.brand').textContent = site.name;
    for (const id of ROOM_IDS) {
        labels.get(id).querySelector('.room-label-floor').textContent = site[id].floor;
        labels.get(id).querySelector('.room-label-title').textContent = site[id].title;
    }

    // Wait briefly for the display font so signs in the scene use it.
    await Promise.race([
        document.fonts?.load('700 48px "Bricolage Grotesque"') ?? Promise.resolve(),
        new Promise((r) => setTimeout(r, 1200)),
    ]);

    try {
        const { World } = await import('./world/World.js');
        world = new World($('#scene'), {
            studio: site.studio,
            games: site.games,
            office: { about: site.about },
        }, {
            onRoom: (id) => { location.hash = `#${id}`; },
            onSpot: (room, spotId) => { location.hash = spotToHash(room, spotId); },
            onRoomHover: (id) => labels.forEach((el, key) => el.classList.toggle('is-hot', key === id)),
            onHover: (hit) => {
                tooltip.hidden = !hit;
                if (!hit) return;
                tooltip.textContent = hit.label;
                const r = stage.getBoundingClientRect();
                tooltip.style.transform = `translate(${hit.x - r.left + 14}px, ${hit.y - r.top + 16}px)`;
            },
            onFrame: placeLabels,
        });
        window.__world = world;
    } catch (err) {
        console.warn('3D view unavailable, showing the plain layout instead.', err);
        document.body.classList.add('no-webgl');
    }
    document.body.classList.add('is-ready');

    function placeLabels() {
        if (!world || route.room) return;
        const inside = !wide();
        for (const [id, el] of labels) {
            const p = world.labelPosition(id);
            el.style.transform = inside
                ? `translate(${Math.round(p.x + 10)}px, ${Math.round(p.y)}px) translate(0, -50%)`
                : `translate(${Math.round(p.x - 14)}px, ${Math.round(p.y)}px) translate(-100%, -50%)`;
        }
    }

    const wide = () => window.matchMedia('(min-width: 900px)').matches;

    /** Points the camera at the current room, framed in the space the UI leaves free. */
    function frameScene() {
        if (!world) return;
        const h = stage.clientHeight;
        let insets;
        if (route.room) {
            insets = wide()
                ? { right: panelEl.offsetWidth, top: 64, bottom: 16 }
                : { bottom: Math.min(panelEl.offsetHeight, h - 200), top: 60 };
        } else {
            insets = wide()
                ? { left: Math.min(stage.clientWidth * 0.34, 470), top: 56, bottom: 24 }
                : { top: $('.intro').offsetHeight + 76, bottom: 64 };
        }
        world.goTo(route.room, insets);
    }

    async function applyRoute() {
        const previous = route;
        route = parseRoute(location.hash);
        document.body.dataset.room = route.room ?? '';
        document.body.classList.toggle('in-room', !!route.room);
        document.querySelectorAll('.topnav a').forEach((a) => {
            const target = parseRoute(a.getAttribute('href'));
            const current = target.room === route.room && (target.sub === 'about') === (route.sub === 'about' && route.room === 'office');
            a.toggleAttribute('aria-current', !!route.room && current);
        });
        tooltip.hidden = true;

        if (!route.room) {
            panel.stopAudio();
            panelEl.inert = true;
            frameScene();
            if (previous.room) labels.get(previous.room)?.focus({ preventScroll: true });
            return;
        }
        panelEl.inert = false;
        await panel.show(route);
        frameScene();
        const changedView = previous.room !== route.room || !!previous.article !== !!route.article || (route.room === 'office' && previous.sub !== route.sub);
        if (changedView) panelEl.querySelector('h2')?.focus({ preventScroll: true });
    }

    labels.forEach((el, id) => {
        const hover = (on) => { if (world && !route.room) world.hoveredRoom = on ? world.rooms.find((r) => r.id === id) : null; };
        el.addEventListener('pointerenter', () => hover(true));
        el.addEventListener('pointerleave', () => hover(false));
        el.addEventListener('focus', () => hover(true));
        el.addEventListener('blur', () => hover(false));
    });

    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !route.room) return;
        location.hash = route.article ? '#office/writing' : '#';
    });
    window.addEventListener('hashchange', applyRoute);
    window.addEventListener('resize', frameScene);
    applyRoute();
}

start().catch((err) => {
    console.error(err);
    document.body.classList.add('is-ready', 'no-webgl');
});

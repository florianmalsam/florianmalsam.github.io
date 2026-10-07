const pages = [...document.querySelectorAll('.page')];
const pageIds = new Set(pages.map((page) => page.id));
const defaultView = 'home';

function viewFromHash() {
    const requestedView = decodeURIComponent(window.location.hash.slice(1));
    return pageIds.has(requestedView) ? requestedView : defaultView;
}

function parentView(view) {
    if (view.startsWith('team-')) return 'teams';
    if (view === 'imprint') return 'club';
    return view;
}

function updateNavigation(view) {
    const activeView = parentView(view);

    document.querySelectorAll('[data-view]').forEach((control) => {
        const isActive = control.dataset.view === activeView;
        control.classList.toggle('btn-neutral', isActive);
        control.classList.toggle('btn-ghost', !isActive);
        control.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
}

function showView(view, { pushHistory = true } = {}) {
    const nextView = pageIds.has(view) ? view : defaultView;

    pages.forEach((page) => {
        const isActive = page.id === nextView;
        page.classList.toggle('is-active', isActive);
        page.setAttribute('aria-hidden', String(!isActive));
    });

    updateNavigation(nextView);
    document.title = `${document.querySelector(`#${CSS.escape(nextView)} h1`)?.textContent.trim() || 'TSB Ravensburg'} | Volleyball`;

    if (pushHistory && window.location.hash !== `#${nextView}`) {
        window.history.pushState({ view: nextView }, '', `#${nextView}`);
    }

    document.querySelector('#mobile-menu')?.removeAttribute('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', (event) => {
    const control = event.target.closest('[data-view], [data-card-view]');
    if (!control) return;

    event.preventDefault();
    showView(control.dataset.view || control.dataset.cardView);
});

document.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-card-view]');
    if (!card || !['Enter', ' '].includes(event.key)) return;

    event.preventDefault();
    showView(card.dataset.cardView);
});

window.addEventListener('popstate', () => {
    showView(viewFromHash(), { pushHistory: false });
});

window.addEventListener('hashchange', () => {
    showView(viewFromHash(), { pushHistory: false });
});

document.querySelector('#contact-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const subject = encodeURIComponent(`Probetraining: ${data.get('team')}`);
    const body = encodeURIComponent(`Name: ${data.get('name')}\nE-Mail: ${data.get('email')}\nTeam: ${data.get('team')}\n\n${data.get('message')}`);

    window.location.href = `mailto:vorstand@ravensburg-volleyball.de?subject=${subject}&body=${body}`;
});

lucide.createIcons();
showView(viewFromHash(), { pushHistory: false });
/**
 * TanStack Router route tree (#64).
 *
 * The router owns top-level page navigation (path-based, one route per page), real code
 * splitting via `lazyRouteComponent`, and scroll restoration. Sub-tabs and deep-link
 * parameters live in the router's typed search (`/treasury?tab=accounts&member=5`); the
 * `useHashTab`/`getHashParams` adapters read/write that search through the exported
 * `router` singleton so page components keep their existing call signatures.
 *
 * The router is mounted (via <RouterProvider>) only once the user is authenticated — App.tsx
 * still owns the boot/login/splash flow. Because the adapters talk to this singleton rather
 * than to router context, they also work in component tests that render a page bare.
 */
import {
    createRootRoute,
    createRoute,
    createRouter,
    createBrowserHistory,
    lazyRouteComponent,
    redirect,
} from '@tanstack/react-router'
import {RootLayout} from './RootLayout'
import {ROUTE_PAGES, type RoutePage, legacyHashToLocation, locationToPath} from './lib/legacyHash'

// Boot redirect: if the app is opened at a legacy hash deep link (e.g. a stored push URL
// `/#treasury:accounts?member=5`), rewrite it to the new path before the history is read, so
// the router starts on the right route. Runs at module eval — before createBrowserHistory().
if (typeof window !== 'undefined') {
    const legacy = legacyHashToLocation(window.location.hash)
    if (legacy) window.history.replaceState(null, '', locationToPath(legacy))
}

const rootRoute = createRootRoute({component: RootLayout})

// `/` → the default landing page.
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => {
        throw redirect({to: '/evening'})
    },
})

/** One lazily-loaded route per page. `lazyRouteComponent`'s 2nd arg selects the named export. */
const pageLoaders: Record<RoutePage, () => Promise<Record<string, unknown>>> = {
    evening: () => import('./pages/EveningHubPage'),
    treasury: () => import('./pages/TreasuryPage'),
    schedule: () => import('./pages/SchedulePage'),
    committee: () => import('./pages/CommitteePage'),
    stats: () => import('./pages/StatsPage'),
    club: () => import('./pages/ClubAdminPage'),
    members: () => import('./pages/MembersPage'),
}

const pageExport: Record<RoutePage, string> = {
    evening: 'EveningHubPage',
    treasury: 'TreasuryPage',
    schedule: 'SchedulePage',
    committee: 'CommitteePage',
    stats: 'StatsPage',
    club: 'ClubAdminPage',
    members: 'MembersPage',
}

const pageRoutes = ROUTE_PAGES.map((page) =>
    createRoute({
        getParentRoute: () => rootRoute,
        path: `/${page}`,
        component: lazyRouteComponent(pageLoaders[page] as never, pageExport[page]),
    }),
)

const routeTree = rootRoute.addChildren([indexRoute, ...pageRoutes])

export const router = createRouter({
    routeTree,
    history: createBrowserHistory(),
    scrollRestoration: true,
    defaultPreload: false,
})

declare module '@tanstack/react-router' {
    interface Register {
        router: typeof router
    }
}

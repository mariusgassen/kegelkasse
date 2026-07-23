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
import {type RoutePage, legacyHashToLocation, locationToPath} from './lib/legacyHash'
import {useAppStore} from './store/app'

// Boot redirect: if the app is opened at a legacy hash deep link (e.g. a stored push URL
// `/#treasury:accounts?member=5`), rewrite it to the new path before the history is read, so
// the router starts on the right route. Runs at module eval — before createBrowserHistory().
if (typeof window !== 'undefined') {
    const legacy = legacyHashToLocation(window.location.hash)
    if (legacy) window.history.replaceState(null, '', locationToPath(legacy))
}

const rootRoute = createRootRoute({component: RootLayout})

// `/` → the default landing page. With an active evening in progress the app opens straight
// into the evening (the AKTIV pill already reflects that); otherwise it lands on the
// personalized "Für dich" dashboard (#66).
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: () => {
        throw redirect({to: useAppStore.getState().activeEveningId ? '/evening' : '/home'})
    },
})

/**
 * Typed search schema per page — the sub-tab (`tab`) plus that page's deep-link params. These
 * make navigation objects at call sites type-checked (`navigate({to:'/treasury', search:{tab:
 * 'accounts', member: 5}})`). Validation is a typed pass-through: TanStack's default search
 * parser already coerces numbers, so runtime behaviour is unchanged — the schema only adds
 * compile-time types (the generic `useHashTab`/`getHashParams` adapters keep reading the raw
 * search, so no deep-link key is ever dropped).
 */
// The dashboard has no deep-link params of its own today, but its search schema must stay
// permissive (not an empty/closed shape) — a closed schema would poison the search type of the
// generic `router.navigate({to: string})` used by the legacy-hash compatibility path.
export type HomeSearch = Record<string, string | number | undefined>
export interface EveningSearch { tab?: 'penalties' | 'games' | 'highlights' | 'manage'; item?: number; comment?: number }
export interface TreasurySearch { tab?: 'overview' | 'accounts' | 'bookings'; member?: number; memberName?: string; rid?: number; q?: string }
export interface ScheduleSearch { evening?: number; event?: number }
export interface CommitteeSearch { tab?: 'announcements' | 'trips' | 'polls'; item?: number; comment?: number }
export interface ClubSearch { tab?: 'settings' | 'penalties' | 'templates' | 'teams' | 'clubs' | 'members' | 'pins' | 'committee' | 'season' | 'backups' }
export interface MembersSearch { memberName?: string }
export interface StatsSearch { tab?: 'evening' | 'year' }

const passThrough = <T,>(s: Record<string, unknown>): T => s as T

// Static import strings per loader keep Vite's per-page code-splitting analyzable.
function pageRoute<S>(
    page: RoutePage,
    loader: () => Promise<unknown>,
    exportName: string,
    validateSearch: (s: Record<string, unknown>) => S,
) {
    return createRoute({
        getParentRoute: () => rootRoute,
        path: `/${page}`,
        validateSearch,
        component: lazyRouteComponent(loader as never, exportName),
    })
}

const routeTree = rootRoute.addChildren([
    indexRoute,
    pageRoute('home', () => import('./pages/HomePage'), 'HomePage', passThrough<HomeSearch>),
    pageRoute('evening', () => import('./pages/EveningHubPage'), 'EveningHubPage', passThrough<EveningSearch>),
    pageRoute('treasury', () => import('./pages/TreasuryPage'), 'TreasuryPage', passThrough<TreasurySearch>),
    pageRoute('schedule', () => import('./pages/SchedulePage'), 'SchedulePage', passThrough<ScheduleSearch>),
    pageRoute('committee', () => import('./pages/CommitteePage'), 'CommitteePage', passThrough<CommitteeSearch>),
    pageRoute('stats', () => import('./pages/StatsPage'), 'StatsPage', passThrough<StatsSearch>),
    pageRoute('club', () => import('./pages/ClubAdminPage'), 'ClubAdminPage', passThrough<ClubSearch>),
    pageRoute('members', () => import('./pages/MembersPage'), 'MembersPage', passThrough<MembersSearch>),
])

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

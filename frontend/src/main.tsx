import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import App from './App'
import {ScoreboardPage} from './pages/ScoreboardPage'
import {scoreboardToken} from './lib/scoreboard'
import {restoreAppIcon} from './lib/appIcon'
import './index.css'

const queryClient = new QueryClient({
    defaultOptions: {queries: {staleTime: 1000 * 10, retry: 1, refetchOnWindowFocus: true}},
})

// The TV scoreboard (#74) is chosen here rather than in the router: `App` owns the boot/login flow
// and only mounts the router once a user is authenticated.
const tvToken = scoreboardToken(window.location.pathname)

// Club-branded install icon (#102): point the head links at the last known club icon right away,
// so installing from the login screen or a cold start already picks it up.
if (!tvToken) restoreAppIcon()

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            {tvToken ? <ScoreboardPage token={tvToken}/> : <App/>}
        </QueryClientProvider>
    </React.StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import App from './App'
import './index.css'
import {installAppHeight} from './lib/appHeight'

// Publish the real usable height (--app-height) before first paint and keep it fresh on
// rotate/resize — see lib/appHeight.ts for why CSS viewport units can't be trusted on iOS PWAs.
installAppHeight()

const queryClient = new QueryClient({
    defaultOptions: {queries: {staleTime: 1000 * 10, retry: 1, refetchOnWindowFocus: true}},
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App/>
        </QueryClientProvider>
    </React.StrictMode>,
)

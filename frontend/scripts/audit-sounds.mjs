/**
 * Offline audit of the penalty call-out presets (`src/lib/soundboard.ts`).
 *
 * Synthesized audio is easy to get subtly wrong and impossible to review in a diff: a preset can
 * clip, run twice as long as its neighbours, sit 12 dB quieter than the rest of the catalog, or
 * decay so slowly that it reads as a beep rather than a strike — none of which shows up in a unit
 * test that only counts how many oscillators were created.
 *
 * So this renders every preset through a real `OfflineAudioContext` in headless Chromium and
 * measures the resulting samples: peak, loudness, duration, attack time and spectral centre. It is
 * a dev tool, not part of CI — it needs a Chromium binary:
 *
 *   node scripts/audit-sounds.mjs                    # auto-detects a local Chromium
 *   CHROME_PATH=/path/to/chrome node scripts/audit-sounds.mjs
 *   node scripts/audit-sounds.mjs --json             # machine-readable output
 *
 * Exit code is non-zero when a preset breaks one of the catalog rules listed in CHECKS below.
 */
import {build} from 'vite'
import {spawn} from 'node:child_process'
import {existsSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT_DIR = join(tmpdir(), 'kegelkasse-sound-audit')

// Catalog rules. These are deliberately loose — they catch "this preset is broken or wildly out of
// family", not "this preset is tasteful", which is still a human's call.
const CHECKS = {
    peakMax: 0.99,          // clipping
    peakMin: 0.05,          // inaudible
    loudnessSpreadDb: 12,   // no preset may be drowned out by its neighbours at one volume setting
    durationMax: 2.2,       // a call-out fires mid-evening; it must not outstay its welcome
    durationMin: 0.12,
    dcOffsetMax: 0.004,      // an offset means a broken envelope, and it eats headroom
}

async function bundleSoundboard() {
    rmSync(OUT_DIR, {recursive: true, force: true})
    await build({
        root: ROOT,
        configFile: false,
        logLevel: 'error',
        resolve: {alias: {'@': join(ROOT, 'src')}},
        build: {
            outDir: OUT_DIR,
            emptyOutDir: true,
            lib: {entry: join(ROOT, 'src/lib/soundboard.ts'), name: 'Soundboard', formats: ['iife'], fileName: () => 'soundboard.js'},
            minify: false,
        },
    })
    return readFileSync(join(OUT_DIR, 'soundboard.js'), 'utf8')
}

function findChrome() {
    const candidates = [
        process.env.CHROME_PATH,
        '/opt/pw-browsers/chromium',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean)
    const found = candidates.find(p => existsSync(p))
    if (!found) throw new Error(`No Chromium found. Set CHROME_PATH. Tried:\n  ${candidates.join('\n  ')}`)
    return found
}

/** Launch headless Chromium and return a minimal CDP client (Node 22 ships a global WebSocket). */
async function launchChrome() {
    const userDataDir = join(tmpdir(), `kegelkasse-sound-audit-profile-${process.pid}`)
    const proc = spawn(findChrome(), [
        '--headless=new', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu',
        '--mute-audio', '--autoplay-policy=no-user-gesture-required', `--user-data-dir=${userDataDir}`,
        'about:blank',
    ], {stdio: ['ignore', 'ignore', 'pipe']})

    const wsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chromium did not report a DevTools endpoint')), 30_000)
        let buffered = ''
        proc.stderr.on('data', chunk => {
            buffered += chunk
            const match = buffered.match(/ws:\/\/\S+/)
            if (match) {
                clearTimeout(timer)
                resolve(match[0])
            }
        })
        proc.on('exit', code => reject(new Error(`Chromium exited early (code ${code})`)))
    })

    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, {once: true})
        ws.addEventListener('error', () => reject(new Error('CDP socket failed')), {once: true})
    })

    let nextId = 0
    const pending = new Map()
    ws.addEventListener('message', event => {
        const msg = JSON.parse(event.data)
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        msg.error ? entry.reject(new Error(msg.error.message)) : entry.resolve(msg.result)
    })

    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, {resolve, reject})
        ws.send(JSON.stringify({id, method, params, sessionId}))
    })

    const {targetId} = await send('Target.createTarget', {url: 'about:blank'})
    const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true})

    return {
        async evaluate(expression) {
            const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, sessionId)
            if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
            return result.result.value
        },
        close() {
            ws.close()
            proc.kill()
            rmSync(userDataDir, {recursive: true, force: true})
        },
    }
}

/** Runs inside the page: render each preset offline and reduce it to a handful of numbers. */
const MEASURE = `(async () => {
    const SAMPLE_RATE = 48000
    const LENGTH = 3
    const keys = Soundboard.SOUND_PRESETS.map(p => p.key)
    const out = []

    for (const key of keys) {
        const ctx = new OfflineAudioContext(2, SAMPLE_RATE * LENGTH, SAMPLE_RATE)
        Soundboard.renderPreset(ctx, key, 0)
        const buffer = await ctx.startRendering()
        const data = buffer.getChannelData(0)

        let peak = 0, sumSq = 0, sum = 0
        for (let i = 0; i < data.length; i++) {
            const v = data[i]
            const a = Math.abs(v)
            if (a > peak) peak = a
            sumSq += v * v
            sum += v
        }
        const rms = Math.sqrt(sumSq / data.length)
        const dc = sum / data.length

        // Duration: last sample above -50 dBFS relative to full scale.
        const floor = 10 ** (-50 / 20)
        let lastLoud = 0
        for (let i = data.length - 1; i >= 0; i--) {
            if (Math.abs(data[i]) > floor) { lastLoud = i; break }
        }
        const duration = lastLoud / SAMPLE_RATE

        // Attack: time to reach 90% of peak, measured on a 3 ms sliding envelope.
        const win = Math.floor(SAMPLE_RATE * 0.003)
        let attack = 0
        for (let i = 0; i + win < data.length; i += win) {
            let localPeak = 0
            for (let j = i; j < i + win; j++) localPeak = Math.max(localPeak, Math.abs(data[j]))
            if (localPeak >= peak * 0.9) { attack = i / SAMPLE_RATE; break }
        }

        // Loudness of the audible part only, so a long quiet tail doesn't flatter a short preset.
        const audible = Math.max(1, lastLoud)
        let loudSq = 0
        for (let i = 0; i < audible; i++) loudSq += data[i] * data[i]
        const loudness = 20 * Math.log10(Math.sqrt(loudSq / audible) + 1e-12)

        // Spectral centre of the first 4096 samples after the attack (naive DFT over log bands) —
        // a cheap "is this bright or dull" number, enough to tell a bell from a drum.
        const start = Math.min(Math.floor(attack * SAMPLE_RATE), data.length - 4096)
        let weighted = 0, total = 0
        for (let band = 0; band < 48; band++) {
            const freq = 60 * Math.pow(2, band / 6)
            if (freq > SAMPLE_RATE / 2) break
            let re = 0, im = 0
            const step = 2 * Math.PI * freq / SAMPLE_RATE
            for (let n = 0; n < 4096; n++) {
                const s = data[start + n] * (0.5 - 0.5 * Math.cos(2 * Math.PI * n / 4096))
                re += s * Math.cos(step * n)
                im += s * Math.sin(step * n)
            }
            const mag = Math.sqrt(re * re + im * im)
            weighted += mag * freq
            total += mag
        }
        const centroid = total > 0 ? weighted / total : 0

        out.push({key, peak, rms, dc, duration, attack, loudness, centroid})
    }
    return out
})()`

const round = (v, n = 3) => Number(v.toFixed(n))

async function main() {
    const bundle = await bundleSoundboard()
    const chrome = await launchChrome()
    try {
        // The bundle drags in the zustand-backed effects store, which reads `process.env` — the
        // audit only exercises the synthesis, so a stub is enough to let the module evaluate.
        await chrome.evaluate("globalThis.process = {env: {NODE_ENV: 'production'}}")
        await chrome.evaluate(bundle)
        const rows = await chrome.evaluate(MEASURE)

        const loudest = Math.max(...rows.map(r => r.loudness))
        const quietest = Math.min(...rows.map(r => r.loudness))
        const problems = []
        for (const r of rows) {
            if (r.peak > CHECKS.peakMax) problems.push(`${r.key}: clips (peak ${round(r.peak)})`)
            if (r.peak < CHECKS.peakMin) problems.push(`${r.key}: inaudible (peak ${round(r.peak)})`)
            if (r.duration > CHECKS.durationMax) problems.push(`${r.key}: runs ${round(r.duration, 2)}s (max ${CHECKS.durationMax}s)`)
            if (r.duration < CHECKS.durationMin) problems.push(`${r.key}: only ${round(r.duration, 2)}s long`)
            if (Math.abs(r.dc) > CHECKS.dcOffsetMax) problems.push(`${r.key}: DC offset ${round(r.dc)}`)
        }
        if (loudest - quietest > CHECKS.loudnessSpreadDb) {
            problems.push(`loudness spread ${round(loudest - quietest, 1)} dB across the catalog (max ${CHECKS.loudnessSpreadDb} dB)`)
        }

        if (process.argv.includes('--json')) {
            console.log(JSON.stringify({rows, problems}, null, 2))
        } else {
            console.log('preset            peak    dBFS   dur(s)  attack(ms)  centroid(Hz)')
            for (const r of rows) {
                console.log(
                    r.key.padEnd(16) +
                    round(r.peak, 2).toFixed(2).padStart(6) +
                    round(r.loudness, 1).toFixed(1).padStart(8) +
                    round(r.duration, 2).toFixed(2).padStart(8) +
                    round(r.attack * 1000, 1).toFixed(1).padStart(12) +
                    Math.round(r.centroid).toString().padStart(14)
                )
            }
            console.log(`\nloudness spread: ${round(loudest - quietest, 1)} dB`)
            console.log(problems.length ? `\n${problems.length} problem(s):\n  ${problems.join('\n  ')}` : '\nAll catalog checks passed.')
        }
        process.exitCode = problems.length ? 1 : 0
    } finally {
        chrome.close()
    }
}

main().catch(err => {
    console.error(err.message)
    process.exitCode = 1
})

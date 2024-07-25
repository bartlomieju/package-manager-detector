import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { async as ezspawn } from '@jsdevtools/ez-spawn'
import { findUp } from 'find-up'
import terminalLink from 'terminal-link'
import prompts from '@posva/prompts'
import type { Agent } from './agents'
import { AGENTS, INSTALL_PAGE, LOCKS } from './agents'
import which from 'which'

export interface DetectOptions {
    autoInstall?: boolean
    programmatic?: boolean
    cwd?: string
}

export * from './agents'

export async function detect({ autoInstall, programmatic, cwd }: DetectOptions = {}) {
    let agent: Agent | null = null
    let version: string | null = null

    const lockPath = await findUp(Object.keys(LOCKS), { cwd })
    let packageJsonPath: string | undefined

    if (lockPath)
        packageJsonPath = path.resolve(lockPath, '../package.json')
    else
        packageJsonPath = await findUp('package.json', { cwd })

    // read `packageManager` field in package.json
    if (packageJsonPath && fs.existsSync(packageJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
            if (typeof pkg.packageManager === 'string') {
                const [name, ver] = pkg.packageManager.replace(/^\^/, '').split('@')
                version = ver
                if (name === 'yarn' && Number.parseInt(ver) > 1) {
                    agent = 'yarn@berry'
                    // the version in packageManager isn't the actual yarn package version
                    version = 'berry'
                }
                else if (name === 'pnpm' && Number.parseInt(ver) < 7) {
                    agent = 'pnpm@6'
                }
                else if (name in AGENTS) {
                    agent = name
                }
                else if (!programmatic) {
                    console.warn('[ni] Unknown packageManager:', pkg.packageManager)
                }
            }
        }
        catch {}
    }

    // detect based on lock
    if (!agent && lockPath)
        agent = LOCKS[path.basename(lockPath)]

    // auto install
    if (agent && !cmdExists(agent.split('@')[0]) && !programmatic) {
        if (!autoInstall) {
            console.warn(`[ni] Detected ${agent} but it doesn't seem to be installed.\n`)

            if (process.env.CI)
                process.exit(1)

            const link = terminalLink(agent, INSTALL_PAGE[agent])
            const { tryInstall } = await prompts({
                name: 'tryInstall',
                type: 'confirm',
                message: `Would you like to globally install ${link}?`,
            })
            if (!tryInstall)
                process.exit(1)
        }

        await ezspawn(`npm i -g ${agent.split('@')[0]}${version ? `@${version}` : ''}`, { stdio: 'inherit', cwd })
    }

    return agent
}

function cmdExists(cmd: string) {
    return which.sync(cmd, { nothrow: true }) !== null
}

import approved from './nodeReleaseApproved.json';
const INSTALL_URL = `https://raw.githubusercontent.com/gstdcoin/gstdbot/${approved.commit}/install.sh`;

export function compareVersions(a: string, b: string): number {
    const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

/** Match the operator-approved signing pin; branch HEAD is not a release. */
export async function getLatestNodeVersion(_timeoutMs = 2000): Promise<string | null> {
    return approved.version;
}

export async function nodeUpdateInfo(current: string | undefined, timeoutMs?: number) {
    const latest = await getLatestNodeVersion(timeoutMs);
    if (!latest || !current) return { update_available: false, latest_version: latest, update_url: INSTALL_URL };
    return {
        update_available: compareVersions(current, latest) < 0,
        approved_commit: approved.commit,
        branch: approved.branch,
        release_channel: 'approved_signed',
        latest_version: latest,
        current_version: current,
        update_url: INSTALL_URL,
    };
}

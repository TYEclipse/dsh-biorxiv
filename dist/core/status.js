/** bioRxiv version selection and publication/retraction status. */
function versionNumber(value) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
export function pickLatestVersion(details) {
    if (details.length === 0)
        return null;
    let selected = details[0];
    let selectedVersion = versionNumber(selected.version);
    for (const detail of details.slice(1)) {
        const version = versionNumber(detail.version);
        if (version > selectedVersion) {
            selected = detail;
            selectedVersion = version;
        }
    }
    return { detail: selected, version: selectedVersion, versionsCount: details.length };
}
function publishedDoi(value) {
    const normalized = (value ?? '').trim();
    return normalized.toLocaleUpperCase() === 'NA' ? '' : normalized;
}
export function buildStatus(doi, details, options = {}) {
    const selected = pickLatestVersion(details);
    if (selected === null)
        return null;
    return {
        doi,
        version: selected.version,
        versionsCount: selected.versionsCount,
        publishedDoi: publishedDoi(selected.detail.published),
        journal: options.journal ?? '',
        retracted: options.retracted ?? null,
    };
}
//# sourceMappingURL=status.js.map
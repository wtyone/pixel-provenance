// Local no-op stats module.
// The app should not contact third-party counters or publish usage data.

export async function trackAnalysis() {}
export async function trackConversion() {}
export async function initStats() {
    document.getElementById('statsBar')?.classList.add('hidden');
}

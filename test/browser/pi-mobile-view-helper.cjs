// The message display switch lives in Settings → 使用偏好 on every screen size.
async function selectMessageView(page, mode) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('workspace:open-settings', { detail: { tab: 'models' } })));
    const button = page.locator(`#pi-transcript-modes [data-transcript-mode="${mode}"]`);
    await button.waitFor({ state: 'visible' });
    await button.click();
    await page.locator('#workspace-settings-close').click();
    await page.locator('#workspace-settings-dialog').waitFor({ state: 'hidden' });
}

// Media/profiles/extensions moved into the "更多功能" menu on narrow screens.
async function openWorkspaceTab(page, tab) {
    if (await page.evaluate(() => innerWidth <= 680)) {
        await page.locator('#workspace-more-toggle').click();
        await page.locator(`#workspace-more-menu [data-more-tab="${tab}"]`).click();
    } else {
        await page.locator(`[data-tab="${tab}"]`).click();
    }
}
// Use the real desktop rail / narrow-screen chooser, or the in-panel selector.
async function openInspector(page, mode = 'details') {
    if (await page.locator('#pi-close-inspector').isVisible()) {
        await page.locator('#pi-inspector-title').focus();
        await page.locator('#pi-inspector-title').selectOption(mode);
    } else if (await page.locator(`#pi-tool-${mode}`).isVisible()) {
        await page.locator(`#pi-tool-${mode}`).click();
    } else {
        await page.locator('#pi-tools-toggle').click();
        await page.locator(`#pi-mobile-tool-${mode}`).click();
    }
    await page.locator('#pi-inspector.open').waitFor({ state: 'visible' });
}
// Use visible header controls; recent projects are an explicit disclosure.
async function openProjectDialog(page, { recent = false } = {}) {
    let opened = false;
    for (const selector of ['#pi-project-button', '#pi-mobile-summary']) {
        const trigger = page.locator(selector);
        if (await trigger.isVisible()) { await trigger.click(); opened = true; break; }
    }
    if (!opened) {
        if (!await page.locator('#pi-session-pane').evaluate(node => node.classList.contains('open'))) await page.locator('#pi-toggle-sessions').click();
        await page.locator('[data-project-open]').click();
    }
    await page.locator('#pi-project-dialog').waitFor({ state: 'visible' });
    if (recent && !await page.locator('.pi-recent-projects').evaluate(node => node.open)) await page.locator('.pi-recent-projects > summary').click();
}
module.exports = { selectMessageView, openWorkspaceTab, openInspector, openProjectDialog };

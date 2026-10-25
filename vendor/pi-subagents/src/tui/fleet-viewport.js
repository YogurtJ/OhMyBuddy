import { ScrollView } from "@earendil-works/pi-tui";
/** Overlay-local clipping: ordinary overlays do not enter Pi's scroll layout traversal. */
export class FleetViewport {
    body = {
        lines: [],
        render() { return this.lines; },
        invalidate() { },
    };
    scroll = new ScrollView(this.body, { follow: "end", overscroll: "contain" });
    requestRender;
    resetTopOnLayout = false;
    constructor(requestRender) {
        this.requestRender = requestRender;
    }
    render(lines, width, height) {
        this.body.lines = lines;
        const rendered = this.scroll.render(width);
        this.scroll.updateLayout(rendered.length, height, this.requestRender);
        if (this.resetTopOnLayout) {
            this.resetTopOnLayout = false;
            this.scroll.scrollTo(0, { disableFollow: true });
        }
        return rendered.slice(this.scroll.scrollTop, this.scroll.scrollTop + this.scroll.viewportHeight);
    }
    resetTop() {
        // Apply again after the new view's dimensions arrive: disableFollow suppresses following
        // at the actual content end, which may differ from the previous view's end.
        this.resetTopOnLayout = true;
        this.scroll.scrollTo(0, { disableFollow: true });
    }
    follow() {
        this.resetTopOnLayout = false;
        this.scroll.scrollToEnd();
    }
}

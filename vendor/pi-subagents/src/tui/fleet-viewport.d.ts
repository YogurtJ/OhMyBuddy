import { ScrollView } from "@earendil-works/pi-tui";
/** Overlay-local clipping: ordinary overlays do not enter Pi's scroll layout traversal. */
export declare class FleetViewport {
    private readonly body;
    readonly scroll: ScrollView;
    private readonly requestRender;
    private resetTopOnLayout;
    constructor(requestRender: () => void);
    render(lines: string[], width: number, height: number): string[];
    resetTop(): void;
    follow(): void;
}

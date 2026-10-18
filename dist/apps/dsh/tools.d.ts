/** dsh tool surface: four thin adapters over src/core/service.ts. */
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ServiceDeps } from '../../core/service.ts';
export interface ToolSet {
    biorxiv_search: ToolDefinition;
    biorxiv_paper: ToolDefinition;
    biorxiv_latest: ToolDefinition;
    biorxiv_export: ToolDefinition;
    biorxiv_digest: ToolDefinition;
}
export declare function buildTools(deps: ServiceDeps): ToolSet;
//# sourceMappingURL=tools.d.ts.map
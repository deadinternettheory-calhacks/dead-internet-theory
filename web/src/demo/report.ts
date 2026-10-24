import { buildReport } from '../analysis/report';
import { syntheticDemo } from './index';

export const exampleReport = buildReport(syntheticDemo.analysis, syntheticDemo.graph, syntheticDemo.enrichments);

import { buildReport } from '../analysis/report';
import { exampleData } from './index';

export const exampleReport = buildReport(exampleData.analysis, exampleData.graph, exampleData.enrichments);

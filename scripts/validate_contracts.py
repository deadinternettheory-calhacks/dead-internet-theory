#!/usr/bin/env python3
"""Validate synthetic contract fixtures and cross-entity invariants (stdlib + PyYAML + jsonschema).

This is a wire-contract check, NOT a live Apify smoke test or a complete OpenAPI spec linter.
"""
from pathlib import Path
import json
import sys
import yaml
from jsonschema import Draft202012Validator, FormatChecker

ROOT=Path(__file__).resolve().parents[1]
contracts=ROOT/'contracts'
models=json.loads((contracts/'models.schema.json').read_text())
api=yaml.safe_load((contracts/'openapi.yaml').read_text())


def validate(name, obj):
    schema={**models,'$ref':f'#/$defs/{name}'}
    Draft202012Validator(schema,format_checker=FormatChecker()).validate(obj)
    return obj


def load_example(fname, definition):
    f=contracts/'examples'/fname
    obj=json.loads(f.read_text())
    validate(definition,obj)
    print(f'  PASS schema: {fname} ({definition})')
    return obj


def ensure(condition, msg):
    if not condition: raise AssertionError(msg)


def graph_check(g):
    nodes=g['nodes']; edges=g['edges']; lookup={v['id']:v for v in nodes}
    ensure(len(nodes)==len(lookup),'duplicate node IDs')
    ensure(len([n for n in nodes if n['type']=='discussion'])==1,'need exactly one discussion root')
    ensure(lookup[g['rootId']]['type']=='discussion','bad root')
    ensure(all(n['platform']==g['platform'] for n in nodes),'cross-platform nodes')
    ensure(all(n['id'].split(':',2)[0]==g['platform'] for n in nodes),'bad platform prefixes')
    ensure(all(n['id'].split(':',2)[1]==n['type'] for n in nodes),'bad type prefixes')
    ensure(sum(n['type']=='comment' for n in nodes)==g['coverage']['retrievedCommentCount'],'count disagreement')
    ekeys={(e['from'],e['to'],e['type']) for e in edges}
    ensure(len(ekeys)==len(edges),'duplicate edge')
    for e in edges:
        ensure(e['from'] in lookup and e['to'] in lookup, f'dangling edge {e}')
        src=lookup[e['from']]; dst=lookup[e['to']]
        if e['type']=='REPLIES_TO':ensure(src['type']=='comment' and dst['type'] in ('comment','discussion'),'bad reply types')
        if e['type']=='AUTHORED':ensure(src['type']=='author' and dst['type']=='comment','bad authored types')
    for c in (x for x in nodes if x['type']=='comment'):
        if c['authorId'] is not None:
            ensure(c['authorId'] in lookup,'dangling authorId')
            ensure((c['authorId'],c['id'],'AUTHORED') in ekeys,'authorId missing authorship edge')
        if c['parentId'] is not None:
            ensure(c['parentId'] in lookup,'dangling parentId')
            ensure((c['id'],c['parentId'],'REPLIES_TO') in ekeys,'parentId missing reply edge')
    root=lookup[g['rootId']]
    if root['authorId'] is not None:ensure(root['authorId'] in lookup and lookup[root['authorId']]['type']=='author','missing root author')
    return lookup


def enrichment_check(req, job, nodes):
    ensure(job['investigationId']=='inv_demo_01','bad investigation')
    ensure(len(job['results'])==len(req['authors']),'must return one result per requested pair')
    for item, result in zip(req['authors'],job['results']):
        a=item['authorId']; c=item['anchorCommentId']
        ensure(nodes[a]['type']=='author' and nodes[c]['type']=='comment','invalid anchor types')
        ensure(nodes[c]['authorId']==a,'anchor author mismatch')
        ensure(result['authorId']==a and result['anchorCommentId']==c,'wrong result pair')
        ensure(len(result['comments'])<=req['limit'],'returned more than 10')
        ensure(result['coverage']['returnedCount']==len(result['comments']),'incorrect returnedCount')
        if result['status']=='complete':ensure(len(result['comments'])==req['limit'],'complete requires all 10')
        if result['status']=='unsupported':ensure(len(result['comments'])==0,'unsupported with comments')
        if result['strategy']=='none':ensure(not result['comments'],'strategy none with comments')
        if result['strategy']=='temporal_nearest':ensure(len(result['comments'])==req['limit'],'temporal_nearest with fewer than 10; must fallback')
        for hc in result['comments']:
            ensure(hc['authorId']==a,'wrong history author')
            ensure(hc['id'] not in nodes,'history comment duplicated in source discussion')


def analysis_check(a,g,job,nodes):
    ensure(a['graphFingerprint']==g['graphFingerprint'],'graph fingerprint mismatch')
    ensure(a['graphRevision']==g['graphRevision'],'graph revision mismatch')
    ensure(job['enrichmentId'] in a['usedEnrichmentIds'],'history referenced but not listed')
    known=set(nodes)
    for r in job['results']:
        known.update(x['id'] for x in r['comments'])
    def ev(xs,where):
        ensure(all(e in known for e in xs),f'{where}: unresolvable evidence IDs {set(xs)-known}')
    ev(a['subject']['evidenceRefs'],'subject')
    ev(a['overallCoordinationRisk']['evidenceRefs'],'risk')
    for axis in a['axes']:ev(axis['evidenceRefs'],'axis')
    for c in a['commentAssessments']:
        ensure(c['commentId'] in nodes and nodes[c['commentId']]['type']=='comment','assessment target not original discussion comment')
        ev(c['evidenceRefs'],'assessment')
    for cluster in a['clusters']:
        ensure(all(c in nodes and nodes[c]['type']=='comment' for c in cluster['commentIds']),'invalid cluster member')
        ev(cluster['evidenceRefs'],'cluster')
    for e in a['inferredEdges']:
        ensure(e['from'] in nodes and e['to'] in nodes,'inferred edge references non-graph IDs')
        ensure(nodes[e['from']]['type']==nodes[e['to']]['type']=='comment','inferred edges only between discussion comments')
        ev(e['evidenceRefs'],'inferred edge')
    sentiment=a['sentiment']; counts=sentiment['counts']
    ensure(sum(counts.values())==sentiment['analyzedCommentCount'],'sentiment sum mismatch')
    if sentiment['population']=='retrieved_comments':
        ensure(sentiment['analyzedCommentCount']==g['coverage']['retrievedCommentCount'],'retrieved population claim needs full comment census')
        ensure(sentiment['method']=='census_of_retrieved','retrieved population claim implies census')
    if sentiment['method']!='census_of_retrieved':ensure(sentiment['population']=='analyzed_sample','sample cannot imply full retrieved corpus')
    axis_names=[ax['axis'] for ax in a['axes']]
    ensure(len(axis_names)==len(set(axis_names)),'duplicate axis')
    for score in [a['overallCoordinationRisk'], *a['axes']]:
        if score['score'] is None:ensure(score['confidence'] is None,'no score requires null confidence')


def openapi_check():
    ensure(api['openapi']=='3.1.0','OpenAPI version changed unexpectedly')
    ensure(api['info']['version']=='1.0.0','version mismatch')
    defs=set(models['$defs'])
    for name,entry in api['components']['schemas'].items():
        ensure(name in defs,'extra OpenAPI schema without canonical model')
        ensure(entry['$ref']==f'./models.schema.json#/$defs/{name}','OpenAPI component not canonical')
    expected={'createInvestigation','getInvestigation','getGraph','requestAuthorEnrichment','getAuthorEnrichment','submitAnalysis','getAnalysis','getCapabilities'}
    found=set()
    for route,methods in api['paths'].items():
        ensure(route.startswith('/v1/'),'API path not versioned')
        for verb,op in methods.items():
            found.add(op['operationId'])
            ensure('responses' in op,'no responses')
            if verb=='post':
                ensure(any(p['name']=='Idempotency-Key' for p in op.get('parameters',[])),'POST lacks idempotency key')
                ensure('requestBody' in op,'POST lacks body')
    ensure(found==expected,f'endpoint set changed: missing={expected-found} extra={found-expected}')


def main():
    Draft202012Validator.check_schema(models)
    for name in models['$defs']:
        Draft202012Validator.check_schema({**models,'$ref':f'#/$defs/{name}'})
    print(f'PASS JSON Schema Draft 2020-12 ({len(models["$defs"])} definitions)')
    openapi_check()
    print(f'PASS OpenAPI references / operations ({len(api["paths"])} paths)')
    g=load_example('graph.json','GraphEnvelope')
    inv=load_example('investigation.json','InvestigationResource')
    req=load_example('enrichment-request.json','EnrichmentRequest')
    job=load_example('enrichment-completed.json','EnrichmentJob')
    unsupported=load_example('enrichment-unsupported.json','EnrichmentJob')
    event=load_example('investigation-ready-event.json','InvestigationReadyEvent')
    a=load_example('analysis-submission.json','AnalysisSubmission')
    full=load_example('analysis-resource.json','AnalysisResource')
    cap=load_example('capabilities.json','CapabilityResponse')
    load_example('error.json','ApiError')
    lookup=graph_check(g)
    enrichment_check(req,job,lookup)
    analysis_check(a,g,job,lookup)
    ensure(inv['graphFingerprint']==g['graphFingerprint'],'investigation graph fingerprint mismatch')
    ensure(full['result']==a,'stored and submitted analysis differ')
    ensure(cap['platforms'][0]['authorHistory']=='supported_best_effort','unexpected matrix')
    ensure(event['investigationId']==g['investigationId'] and event['graphRevision']==g['graphRevision'] and event['graphFingerprint']==g['graphFingerprint'],'internal event graph mismatch')
    ensure(unsupported['results'][0]['status']=='unsupported' and not unsupported['results'][0]['coverage']['actorRunIds'],'unsupported enrichment invoked Actor')
    print('PASS graph integrity, history sampling, evidence, and analysis consistency')
    print('All contract validation checks passed.')

if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(f'FAILED: {type(exc).__name__}: {exc}',file=sys.stderr)
        raise

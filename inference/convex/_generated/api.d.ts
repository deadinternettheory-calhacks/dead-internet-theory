/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as http from "../http.js";
import type * as lib_backendClient from "../lib/backendClient.js";
import type * as lib_contract from "../lib/contract.js";
import type * as lib_fixtures from "../lib/fixtures.js";
import type * as lib_inference_assemble from "../lib/inference/assemble.js";
import type * as lib_inference_claude from "../lib/inference/claude.js";
import type * as lib_inference_creao from "../lib/inference/creao.js";
import type * as lib_inference_evidence from "../lib/inference/evidence.js";
import type * as lib_inference_features from "../lib/inference/features.js";
import type * as lib_inference_outputs from "../lib/inference/outputs.js";
import type * as lib_inference_packet from "../lib/inference/packet.js";
import type * as lib_inference_pipeline from "../lib/inference/pipeline.js";
import type * as lib_inference_prompts from "../lib/inference/prompts.js";
import type * as lib_inference_rubric from "../lib/inference/rubric.js";
import type * as lib_inference_scoring from "../lib/inference/scoring.js";
import type * as lib_util from "../lib/util.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  http: typeof http;
  "lib/backendClient": typeof lib_backendClient;
  "lib/contract": typeof lib_contract;
  "lib/fixtures": typeof lib_fixtures;
  "lib/inference/assemble": typeof lib_inference_assemble;
  "lib/inference/claude": typeof lib_inference_claude;
  "lib/inference/creao": typeof lib_inference_creao;
  "lib/inference/evidence": typeof lib_inference_evidence;
  "lib/inference/features": typeof lib_inference_features;
  "lib/inference/outputs": typeof lib_inference_outputs;
  "lib/inference/packet": typeof lib_inference_packet;
  "lib/inference/pipeline": typeof lib_inference_pipeline;
  "lib/inference/prompts": typeof lib_inference_prompts;
  "lib/inference/rubric": typeof lib_inference_rubric;
  "lib/inference/scoring": typeof lib_inference_scoring;
  "lib/util": typeof lib_util;
  worker: typeof worker;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

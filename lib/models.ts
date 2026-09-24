/**
 * Model registry.
 *
 * Every endpoint, parameter, enum value and type below was verified against the
 * LIVE API, not taken from the published OpenAPI spec — the spec is wrong in
 * several places and omits several models entirely. Confirmed differences:
 *
 *   - Spec lists `/veo3.1` and `/veo3.1/fast`; the real paths end in
 *     `/text-to-video`.
 *   - Spec says Soul's `resolution` is 2K/4K; live it is 720p/1080p.
 *   - Spec types numeric enums as strings (`duration: ["4","6","8"]`); the live
 *     API rejects strings and requires integers.
 *   - Spec documents `num_images` for Soul; live, Soul uses `batch_size` (1 or
 *     4 only) and silently ignores `num_images`.
 *   - Seedance 2.5, Recraft V4.1 and Soul Character are absent from the spec.
 *
 * The API ignores unknown fields rather than rejecting them, so a wrong
 * parameter name fails SILENTLY. A parameter is therefore only listed here when
 * the live API confirmed it by rejecting a deliberately invalid value.
 * Re-check with `npm run verify` after any change.
 */

import { CATALOG } from "./catalog";

export type ParamType = "enum" | "int" | "float" | "bool" | "seed" | "text";

export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  options?: Array<string | number>;
  default?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  required?: boolean;
}

export interface ModelDef {
  id: string;
  name: string;
  /** Grouping label for the picker — "Kling", "Seedance", "Higgsfield". */
  family?: string;
  vendor: string;
  kind: "image" | "video";
  /** Endpoint used when no reference image is attached. */
  endpoint: string;
  /** Endpoint swapped in when a reference image is attached. */
  imageEndpoint?: string;
  /** Body key that receives the uploaded reference URL. */
  refImageKey?: string;
  /**
   * What the attachment must be. Higgsfield's storage only issues upload URLs
   * for images, `video/mp4` and `audio/wav`, so those are the three options.
   */
  refKind?: "image" | "video" | "audio";
  /** Send references as an array of URL strings rather than a single string. */
  refArray?: boolean;
  /**
   * Distinct body keys for successive attachments, for models that want a
   * first and last keyframe. Attachment 1 fills refKeys[0], attachment 2
   * refKeys[1]. Takes precedence over refImageKey when present.
   */
  refKeys?: string[];
  /** Accepts more than one reference image. */
  refMultiple?: boolean;
  maxRefImages?: number;
  /** Cannot run without a reference image. */
  refRequired?: boolean;
  /** Body key for batch size — normalised so the UI has one stepper. */
  batchKey?: string;
  batchOptions?: number[];
  params: ParamDef[];
  blurb: string;
  /**
   * Priced per token rather than per request, so /estimate returns a pricing
   * description instead of a figure. The composer shows "metered" and
   * Higgsfield reconciles the real charge afterwards.
   */
  metered?: boolean;
  /** Rough note shown next to a metered model, since it has no fixed price. */
  meteredNote?: string;
  /**
   * Baseline price at this app's default settings, from /estimate on the
   * author's key. Indicative only — pricing varies by plan and discount, and
   * the composer always quotes the live figure before you commit.
   */
  fromUsd: number;
}

// Verified enum sets. Kept separate per family: the values genuinely differ and
// sending one model's value to another is a 400.
const SOUL_AR = ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"];
const POPCORN_AR = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"];
const RECRAFT_AR = [
  "1:1", "2:1", "1:2", "3:2", "2:3", "4:3", "3:4",
  "5:4", "4:5", "6:10", "14:10", "10:14", "16:9", "9:16",
];
const SEEDANCE_AR = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
// Shared by Z-Image and Qwen, which expose the same ten ratios.
const MODERN_AR = ["1:1", "2:3", "3:2", "3:4", "4:3", "7:9", "9:7", "9:16", "16:9", "21:9"];
const GROK_AR = ["auto", "1:1", "1:2", "2:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"];
// Ideogram exposes an unusually wide set, including very long panoramas.
const IDEOGRAM_AR = [
  "1:1", "1:2", "2:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9", "5:8", "8:5",
  "3:4", "4:3", "9:22", "22:9", "9:23", "23:9", "3:8", "8:3", "5:12", "12:5", "1:3", "3:1",
];
const MARKETING_AR = ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
const KLING3_AR = ["16:9", "9:16", "1:1"];
const PIXVERSE_AR = ["16:9", "4:3", "1:1", "3:4", "9:16"];
const H3_AR = ["auto", "adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const WAN_AR = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const ONE_TWO_K = ["1k", "2k"];
const WIDE_TALL = ["16:9", "9:16"];
const HD = ["720p", "1080p"];

const SEED: ParamDef = { key: "seed", label: "Seed", type: "seed" };
const ENHANCE: ParamDef = { key: "enhance_prompt", label: "Enhance", type: "bool", default: true };

/**
 * Models the live `/models` catalogue does not list but which are verified to
 * work. The catalogue is authoritative for what it contains, but it is not
 * exhaustive — these were each confirmed by a live /estimate call.
 */
const EXTRAS: ModelDef[] = [
  {
    id: "soul-cinema",
    name: "Soul Cinema",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "image",
    endpoint: "/higgsfield-ai/soul/cinema",
    batchKey: "batch_size",
    batchOptions: [1, 4],
    fromUsd: 0.004,
    blurb: "Cinematic look, and the cheapest way to draft an idea.",
    params: [
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: SOUL_AR, default: "4:3" },
      ENHANCE,
      SEED,
    ],
  },
  {
    id: "popcorn",
    name: "Popcorn",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "image",
    endpoint: "/higgsfield-ai/popcorn/auto",
    batchKey: "num_images",
    batchOptions: [1, 2, 3, 4],
    fromUsd: 0.092,
    blurb: "Goes up to 1600p, and takes any batch size from one to four.",
    params: [
      { key: "resolution", label: "Quality", type: "enum", options: ["720p", "1600p"], default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: POPCORN_AR, default: "4:3" },
      SEED,
    ],
  },
  {
    id: "soul-reference",
    name: "Soul Reference",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "image",
    endpoint: "/higgsfield-ai/soul/reference",
    refImageKey: "image_reference_url",
    refRequired: true,
    batchKey: "batch_size",
    batchOptions: [1, 4],
    fromUsd: 0.094,
    blurb: "Match the style of a reference image. Requires an attachment.",
    params: [
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: SOUL_AR, default: "4:3" },
      { key: "style_strength", label: "Strength", type: "float", min: 0, max: 1, step: 0.05, default: 1 },
      ENHANCE,
      SEED,
    ],
  },
  {
    id: "soul-character",
    name: "Soul Character",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "image",
    endpoint: "/higgsfield-ai/soul/character",
    batchKey: "batch_size",
    batchOptions: [1, 4],
    fromUsd: 0.094,
    blurb: "Place a saved character in a new scene. Needs a character ID.",
    params: [
      {
        key: "custom_reference_id",
        label: "Character",
        type: "text",
        required: true,
        placeholder: "character UUID from Higgsfield",
      },
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: SOUL_AR, default: "4:3" },
      { key: "custom_reference_strength", label: "Likeness", type: "float", min: 0, max: 1, step: 0.05, default: 1 },
      { key: "style_strength", label: "Style", type: "float", min: 0, max: 1, step: 0.05, default: 1 },
      ENHANCE,
      SEED,
    ],
  },
  {
    id: "hailuo-02",
    name: "Hailuo 02",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/hailuo-02/standard/text-to-video",
    imageEndpoint: "/minimax/hailuo-02/standard/image-to-video",
    refImageKey: "image_url",
    fromUsd: 0.09,
    blurb: "The cheapest video on the API by a wide margin.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [6, 10], default: 6 },
      { key: "prompt_optimizer", label: "Optimise", type: "bool", default: true },
    ],
  },
  {
    id: "hailuo-2-3-fast",
    name: "Hailuo 2.3 Fast",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/hailuo-2.3-fast/standard/image-to-video",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.19,
    blurb: "Quick image-to-video. Requires an attachment.",
    params: [{ key: "duration", label: "Length", type: "enum", options: [6, 10], default: 6 }],
  },
  {
    id: "hailuo-2-3-pro",
    name: "Hailuo 2.3 Pro",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/hailuo-2.3/pro/text-to-video",
    imageEndpoint: "/minimax/hailuo-2.3/pro/image-to-video",
    refImageKey: "image_url",
    fromUsd: 0.49,
    blurb: "The higher-fidelity Hailuo tier.",
    params: [{ key: "prompt_optimizer", label: "Optimise", type: "bool", default: true }],
  },
  {
    id: "wan-2-5-preview",
    name: "Wan 2.5 Preview",
    family: "Wan",
    vendor: "wan",
    kind: "video",
    endpoint: "/wan-25-preview/text-to-video",
    imageEndpoint: "/wan-25-preview/image-to-video",
    refImageKey: "image_url",
    fromUsd: 0.5,
    blurb: "Can drop to 480p for cheap drafts.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [5, 10], default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: ["480p", "720p", "1080p"], default: "720p" },
      SEED,
    ],
  },
  {
    id: "dop-lite",
    name: "DoP Lite",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "video",
    endpoint: "/higgsfield-ai/dop/lite",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.125,
    blurb: "Higgsfield's own camera-motion model. Needs an image.",
    params: [ENHANCE, SEED],
  },
  {
    id: "dop-turbo",
    name: "DoP Turbo",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "video",
    endpoint: "/higgsfield-ai/dop/turbo",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.407,
    blurb: "Higher-quality DoP. Needs an image.",
    params: [ENHANCE, SEED],
  },
  {
    id: "kling-2-1-master",
    name: "2.1 Master",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    endpoint: "/kling-video/v2.1/master/text-to-video",
    imageEndpoint: "/kling-video/v2.1/master/image-to-video",
    refImageKey: "image_url",
    fromUsd: 1.4,
    blurb: "Kling's 2.1 flagship tier.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [5, 10], default: 5 },
      { key: "cfg_scale", label: "CFG", type: "float", min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: "negative_prompt", label: "Avoid", type: "text", placeholder: "blurry, distorted…" },
    ],
  },
  {
    id: "hailuo-02-pro",
    name: "Hailuo 02 Pro",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/hailuo-02/pro/text-to-video",
    imageEndpoint: "/minimax/hailuo-02/pro/image-to-video",
    refImageKey: "image_url",
    fromUsd: 0.488,
    blurb: "The Pro Hailuo 02 tier. 6s · text or image input.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [6], default: 6 },
      { key: "prompt_optimizer", label: "Optimise", type: "bool", default: true },
    ],
  },
  {
    id: "hailuo-2-3-fast-pro",
    name: "Hailuo 2.3 Fast Pro",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/hailuo-2.3-fast/pro/image-to-video",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.33,
    blurb: "6s · needs an image.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [6], default: 6 },
      { key: "prompt_optimizer", label: "Optimise", type: "bool", default: true },
    ],
  },
  {
    id: "kling-2-1-standard",
    name: "2.1 Standard",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    endpoint: "/kling-video/v2.1/standard/image-to-video",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.28,
    blurb: "5\u201310s · needs an image.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [5, 10], default: 5 },
      { key: "cfg_scale", label: "CFG", type: "float", min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
  },
  {
    id: "kling-2-1-pro",
    name: "2.1 Pro",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    endpoint: "/kling-video/v2.1/pro/image-to-video",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.49,
    blurb: "5\u201310s · needs an image.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [5, 10], default: 5 },
      { key: "cfg_scale", label: "CFG", type: "float", min: 0, max: 1, step: 0.01, default: 0.5 },
    ],
  },
  {
    id: "dop-standard",
    name: "DoP Standard",
    family: "Higgsfield",
    vendor: "higgsfield-ai",
    kind: "video",
    endpoint: "/higgsfield-ai/dop/standard",
    refImageKey: "image_url",
    refRequired: true,
    fromUsd: 0.563,
    blurb: "The full-quality DoP tier. Needs an image.",
    params: [ENHANCE, SEED],
  },
  {
    id: "kling-o3-first-last",
    name: "O3 First\u2013Last Frame",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    // Two attachments: the opening frame and the closing frame.
    refKeys: ["first_frame_url", "last_frame_url"],
    refRequired: true,
    endpoint: "/kling-video/o3/first-last-frame",
    fromUsd: 0.56,
    blurb: "Interpolates between two images. Attach a start then an end frame.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 3, max: 15, step: 1, default: 5 },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: KLING3_AR, default: "16:9" },
    ],
  },
  {
    id: "kling-omni-first-last",
    name: "Omni First\u2013Last Frame",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    refKeys: ["first_frame_url", "last_frame_url"],
    refRequired: true,
    endpoint: "/kling-video/omni/first-last-frame",
    fromUsd: 0.56,
    blurb: "Interpolates between two images. Attach a start then an end frame.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 3, max: 15, step: 1, default: 5 },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: KLING3_AR, default: "16:9" },
    ],
  },
  // ------------------------------------------------- video / audio input
  //
  // These take a clip (or a sound) rather than a still. Higgsfield's storage
  // only issues upload URLs for MP4 and WAV, so those are the accepted formats.
  {
    id: "seedance-2-5-video-edit",
    name: "Seedance 2.5 Video Edit",
    family: "Seedance",
    vendor: "bytedance",
    kind: "video",
    endpoint: "/bytedance/seedance-2.5/video-edit",
    refImageKey: "video_url",
    refKind: "video",
    refRequired: true,
    metered: true,
    meteredNote: "Billed per token. Re-edits a clip you attach.",
    fromUsd: 0,
    blurb: "Edit an existing clip with a prompt. Attach an MP4.",
    params: [
      { key: "resolution", label: "Quality", type: "enum", options: ["480p", "720p"], default: "720p" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
  {
    id: "seedance-2-5-video-extend",
    name: "Seedance 2.5 Video Extend",
    family: "Seedance",
    vendor: "bytedance",
    kind: "video",
    endpoint: "/bytedance/seedance-2.5/video-extend",
    refImageKey: "video_url",
    refKind: "video",
    refRequired: true,
    metered: true,
    meteredNote: "Billed per token. Continues a clip you attach.",
    fromUsd: 0,
    blurb: "Continue an existing clip. Attach an MP4.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 4, max: 16, step: 1, default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: ["480p", "720p"], default: "720p" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
  {
    id: "seedance-2-0-reference-to-video",
    name: "Seedance 2.0 Video Reference",
    family: "Seedance",
    vendor: "bytedance",
    kind: "video",
    endpoint: "/bytedance/seedance-2.0/reference-to-video",
    refImageKey: "video_urls",
    refArray: true,
    refKind: "video",
    refRequired: true,
    metered: true,
    meteredNote: "Billed per token. Goes up to 4K.",
    fromUsd: 0,
    blurb: "Use a clip as a reference. Up to 4K.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 4, max: 15, step: 1, default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: ["480p", "720p", "1080p", "4k"], default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: SEEDANCE_AR, default: "16:9" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
  {
    id: "seedance-2-5-audio-reference",
    name: "Seedance 2.5 Audio Reference",
    family: "Seedance",
    vendor: "bytedance",
    kind: "video",
    endpoint: "/bytedance/seedance-2.5/reference-to-video",
    refImageKey: "audio_urls",
    refArray: true,
    refKind: "audio",
    refRequired: true,
    metered: true,
    meteredNote: "Billed per token. Drives the video from an audio track.",
    fromUsd: 0,
    blurb: "Drive a video from a sound. Attach a WAV.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 4, max: 16, step: 1, default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: ["480p", "720p"], default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: SEEDANCE_AR, default: "16:9" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
  {
    id: "kling-o3-video-reference",
    name: "O3 Video Reference",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    endpoint: "/kling-video/o3/video-reference",
    refImageKey: "video_urls",
    refArray: true,
    // The field is an array but the API rejects more than one entry.
    maxRefImages: 1,
    refKind: "video",
    refRequired: true,
    fromUsd: 0.84,
    blurb: "Use a clip as a motion reference. Attach an MP4.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 3, max: 10, step: 1, default: 5 },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: KLING3_AR, default: "16:9" },
    ],
  },
  {
    id: "kling-omni-video-reference",
    name: "Omni Video Reference",
    family: "Kling",
    vendor: "kling-video",
    kind: "video",
    endpoint: "/kling-video/omni/video-reference",
    refImageKey: "video_urls",
    refArray: true,
    // The field is an array but the API rejects more than one entry.
    maxRefImages: 1,
    refKind: "video",
    refRequired: true,
    fromUsd: 0.84,
    blurb: "Use a clip as a motion reference. Attach an MP4.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 3, max: 10, step: 1, default: 5 },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: KLING3_AR, default: "16:9" },
    ],
  },
  {
    id: "minimax-h3-video-reference",
    name: "H3 Video Reference",
    family: "MiniMax",
    vendor: "minimax",
    kind: "video",
    endpoint: "/minimax/h3/reference-to-video",
    refImageKey: "video_urls",
    refArray: true,
    refKind: "video",
    refRequired: true,
    metered: true,
    meteredNote: "Billed per token. Outputs at 2K.",
    fromUsd: 0,
    blurb: "Use a clip as a reference. Outputs 2K.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 5, max: 15, step: 1, default: 5 },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: H3_AR, default: "16:9" },
    ],
  },
  {
    id: "wan-2-6-video-reference",
    name: "2.6 Video Reference",
    family: "Wan",
    vendor: "wan",
    kind: "video",
    endpoint: "/wan/v2.6/reference-to-video",
    refImageKey: "video_urls",
    refArray: true,
    refKind: "video",
    refRequired: true,
    fromUsd: 0.5,
    blurb: "Use a clip as a reference. Attach an MP4.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [5, 10], default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: WAN_AR, default: "16:9" },
    ],
  },
  {
    id: "wan-2-7-video-reference",
    name: "2.7 Video Reference",
    family: "Wan",
    vendor: "wan",
    kind: "video",
    endpoint: "/wan/v2.7/reference-to-video",
    refImageKey: "video_urls",
    refArray: true,
    refKind: "video",
    refRequired: true,
    fromUsd: 0.5,
    blurb: "Use a clip as a reference. Attach an MP4.",
    params: [
      { key: "duration", label: "Length", type: "int", min: 2, max: 10, step: 1, default: 5 },
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: WIDE_TALL, default: "16:9" },
      SEED,
    ],
  },

  // Veo worked until early September and then went to `model_disabled`. Kept so
  // it lights up on its own if Higgsfield restores it; until then the composer
  // greys it out with the reason.
  {
    id: "veo-3-1-fast",
    name: "3.1 Fast",
    family: "Veo",
    vendor: "veo3.1",
    kind: "video",
    endpoint: "/veo3.1/fast/text-to-video",
    imageEndpoint: "/veo3.1/fast/image-to-video",
    refImageKey: "image_url",
    fromUsd: 0.6,
    blurb: "Google's quicker Veo tier, with optional native audio.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [4, 6, 8], default: 6 },
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: WIDE_TALL, default: "16:9" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
  {
    id: "veo-3-1",
    name: "3.1",
    family: "Veo",
    vendor: "veo3.1",
    kind: "video",
    endpoint: "/veo3.1/text-to-video",
    imageEndpoint: "/veo3.1/image-to-video",
    refImageKey: "image_url",
    fromUsd: 1.2,
    blurb: "Google's top Veo tier.",
    params: [
      { key: "duration", label: "Length", type: "enum", options: [4, 6, 8], default: 6 },
      { key: "resolution", label: "Quality", type: "enum", options: HD, default: "720p" },
      { key: "aspect_ratio", label: "Ratio", type: "enum", options: WIDE_TALL, default: "16:9" },
      { key: "generate_audio", label: "Audio", type: "bool", default: false },
    ],
  },
];

/**
 * The full registry: everything the live catalogue advertises, plus the
 * verified extras above. Deduplicated by endpoint, extras winning — their
 * parameters were curated by hand and carry better labels and defaults.
 */
export const MODELS: ModelDef[] = (() => {
  const byEndpoint = new Map<string, ModelDef>();
  for (const m of CATALOG) byEndpoint.set(m.endpoint, m);
  for (const m of EXTRAS) byEndpoint.set(m.endpoint, m);
  return [...byEndpoint.values()];
})();

/** Families present for a given kind, cheapest model first. */
export function familiesByKind(kind: "image" | "video"): string[] {
  const seen = new Map<string, number>();
  for (const m of modelsByKind(kind)) {
    const f = m.family ?? m.vendor;
    seen.set(f, Math.min(seen.get(f) ?? Infinity, rank(m)));
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1]).map(([f]) => f);
}

/** Models within one family, for the second level of the picker. */
export function modelsInFamily(kind: "image" | "video", family: string): ModelDef[] {
  return modelsByKind(kind)
    .filter((m) => (m.family ?? m.vendor) === family)
    .sort((a, b) => rank(a) - rank(b));
}

export function getModel(id: string): ModelDef | undefined {
  return MODELS.find((m) => m.id === id);
}

/** Sort key: cheapest first. Metered models have no fixed price, so they sort
 *  last rather than masquerading as free. */
function rank(m: ModelDef): number {
  if (m.metered) return Number.MAX_SAFE_INTEGER - 1;
  return m.fromUsd > 0 ? m.fromUsd : Number.MAX_SAFE_INTEGER;
}

export function modelsByKind(kind: "image" | "video"): ModelDef[] {
  return MODELS.filter((m) => m.kind === kind).sort((a, b) => rank(a) - rank(b));
}

/** Which endpoint to hit, given whether a reference image is attached. */
export function resolveEndpoint(model: ModelDef, hasRef: boolean): string {
  if (hasRef && model.imageEndpoint) return model.imageEndpoint;
  return model.endpoint;
}

/** Whether this model can take a reference image at all. */
export function supportsAttachment(model: ModelDef): boolean {
  return Boolean(model.refImageKey || model.imageEndpoint || model.refKeys?.length);
}

/**
 * Where to land when someone attaches an image while on a model that can't use
 * one. Attaching a picture is a clear statement of intent, so the app switches
 * rather than ignoring the file.
 */
export function attachmentFallback(
  kind: "image" | "video",
  refKind: "image" | "video" | "audio" = "image",
): ModelDef | undefined {
  return MODELS.find(
    (m) => m.kind === kind && supportsAttachment(m) && (m.refKind ?? "image") === refKind,
  );
}

/** What kind of file this model's attachment slot expects. */
export function refKindOf(model: ModelDef): "image" | "video" | "audio" {
  return model.refKind ?? "image";
}

/** `accept` attribute for the file picker, matching what storage allows. */
export function acceptFor(refKind: "image" | "video" | "audio"): string {
  if (refKind === "video") return "video/mp4";
  if (refKind === "audio") return "audio/wav";
  return "image/jpeg,image/png,image/webp,image/gif";
}

/** How many references this model will take. */
export function maxRefs(model: ModelDef): number {
  if (model.refKeys?.length) return model.refKeys.length;
  if (!supportsAttachment(model)) return 0;
  return model.refMultiple ? (model.maxRefImages ?? 8) : 1;
}

/** Defaults for every declared param, used to seed the prompt bar's state. */
export function defaultParams(model: ModelDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of model.params) {
    if (p.default !== undefined) out[p.key] = p.default;
  }
  return out;
}

/**
 * Build the JSON body for a generation request.
 *
 * Coercion matters more than it looks: HTML controls stringify everything, but
 * the live API is strict and rejects `"8"` where it wants `8`, and `"true"`
 * where it wants `true`. Enum values are matched back to the declared option so
 * a numeric enum stays numeric.
 */
export function buildBody(
  model: ModelDef,
  prompt: string,
  params: Record<string, unknown>,
  batch: number,
  refUrls: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = { prompt };

  for (const def of model.params) {
    let value = params[def.key];
    if (value === undefined || value === "") {
      if (!def.required) continue;
      value = def.default;
    }
    if (value === undefined) continue;

    if (def.type === "int" || def.type === "seed") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      body[def.key] = Math.round(n);
    } else if (def.type === "float") {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      body[def.key] = n;
    } else if (def.type === "bool") {
      body[def.key] = Boolean(value);
    } else if (def.type === "text") {
      body[def.key] = String(value);
    } else if (def.type === "enum") {
      const match = def.options?.find((o) => String(o) === String(value));
      body[def.key] = match !== undefined ? match : value;
    }
  }

  if (model.batchKey && model.batchOptions) {
    const allowed = model.batchOptions;
    const chosen = allowed.includes(batch)
      ? batch
      : allowed.reduce((a, b) => (Math.abs(b - batch) < Math.abs(a - batch) ? b : a));
    body[model.batchKey] = chosen;
  }

  if (refUrls.length && model.refKeys?.length) {
    // One attachment per declared key, in order.
    model.refKeys.forEach((key, i) => {
      if (refUrls[i]) body[key] = refUrls[i];
    });
  } else if (refUrls.length && model.refImageKey) {
    const capped = refUrls.slice(0, model.maxRefImages ?? refUrls.length);
    body[model.refImageKey] = model.refArray ? capped : capped[0];
  }

  return body;
}

/**
 * The aspect ratio a model falls back to when a job didn't record one.
 *
 * A job stores the body it was submitted with, so if the caller never set
 * `aspect_ratio` the API applied its own default and the job has no ratio to
 * lay out from. The registry knows that default, which is more accurate than
 * assuming square.
 */
export function defaultAspect(modelId: string): number | null {
  const model = getModel(modelId);
  const def = model?.params.find((p) => p.key === "aspect_ratio")?.default;
  if (typeof def !== "string" || !def.includes(":")) return null;
  const [w, h] = def.split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  return w / h;
}

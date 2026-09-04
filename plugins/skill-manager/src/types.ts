/** Browser-uploaded file data carried to the loopback Host. */
export interface UploadedSkillFile {
  readonly path: string
  readonly contentBase64: string
  readonly mimeType?: string
}

/** Browser import request accepted by the Skill Host. */
export type SkillImportRequest =
  | { readonly kind: 'files'; readonly files: readonly UploadedSkillFile[] }
  | { readonly kind: 'github'; readonly url: string }

/** User-facing source group for a discovered Skill. */
export type ManagedSkillSourceGroup = 'personal' | 'project' | 'runtime' | 'custom' | 'bundled'

/** One Skill row shown in Settings. */
export interface ManagedSkillSummary {
  readonly name: string
  readonly description: string
  readonly source: string
  readonly sourceGroup: ManagedSkillSourceGroup
  readonly provider: string
  readonly writable: boolean
  readonly whenToUse?: string
  /** Frontmatter grouping tag shown next to the row title; absent when untagged. */
  readonly category?: string
}

/** One safe preview returned by the Host. */
export type ManagedSkillFile =
  | { readonly path: string; readonly kind: 'markdown' | 'text' | 'code'; readonly size: number; readonly content: string }
  | { readonly path: string; readonly kind: 'image'; readonly size: number; readonly dataUrl: string }
  | { readonly path: string; readonly kind: 'binary'; readonly size: number; readonly mimeType: string }

/** Full same-page Skill inspection response. */
export interface ManagedSkillDetail extends ManagedSkillSummary {
  readonly explanation: string
  readonly files: readonly ManagedSkillFile[]
}

/** Successful personal Skill installation response. */
export interface SkillInstallResult {
  readonly installed: string
  readonly replaced: boolean
}

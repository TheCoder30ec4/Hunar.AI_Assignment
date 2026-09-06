/**
 * Branded IDs. A CampaignId cannot be passed where a SearchId is expected,
 * which matters once four screens are routing on similar-looking UUIDs.
 */
declare const brand: unique symbol

type Brand<T, TBrand extends string> = T & { readonly [brand]: TBrand }

export type SearchId = Brand<string, 'SearchId'>
export type CampaignId = Brand<string, 'CampaignId'>
export type CandidateId = Brand<string, 'CandidateId'>
export type CallId = Brand<string, 'CallId'>

export const asSearchId = (value: string): SearchId => value as SearchId
export const asCampaignId = (value: string): CampaignId => value as CampaignId
export const asCandidateId = (value: string): CandidateId => value as CandidateId
export const asCallId = (value: string): CallId => value as CallId

// A restored Creation may initialize the edition once. Local choices always win
// over cached or delayed hydration; only the save queue may confirm/roll them back.
export function canHydrateEdition(initialRevision: number, currentRevision: number) {
  return initialRevision === 0 && currentRevision === 0
}

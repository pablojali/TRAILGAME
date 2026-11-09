/** A race is being run (its segments and clips): celebrations wait for the result screen. */
export function inRace(pathname: string): boolean {
  return pathname.startsWith('/races/run/')
}

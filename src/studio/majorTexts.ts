/** Messages for the Majors tab (Trail Studio's language: English). */
export const ERRORS: Record<string, string> = {
  'not-signed-in': 'Your session expired: sign in again.',
  'not-admin': 'Your account is not a Trail Studio admin.',
  'not-draft': 'Only a draft can be changed.',
  'too-soon': 'It starts too soon to publish (before READY opens).',
  final: 'That Major is already finished or cancelled.',
  'not-found': 'That Major no longer exists.',
  'event-name': 'The name must have 1 to 80 characters.',
  'event-description': 'The description takes up to 500 characters.',
  'event-race': 'Choose a race from the catalog.',
  'event-start': 'The start date is not valid.',
  'event-past': 'The start must be in the future.',
  'cancel-reason': 'Write the reason for cancelling.',
  'media-closed': 'The banner and videos can no longer change: the race is running or finished.',
  'media-segment': 'That segment does not exist in the race.',
  'media-path': 'That file is not this Major\'s.',
  'config-start-time': 'Start time not valid.',
  'config-registration-days': 'Registration days go from 1 to 13.',
  'config-ready-minutes': 'READY minutes go from 5 to 180.',
  'config-window': 'The decision window goes from 30 to 600 s.',
  'config-running': 'The running phase goes from 30 to 900 s.',
  'config-limit': 'Participants go from 2 to 50.',
  network: 'Could not reach the server.',
  'bad-request': 'The server did not understand the request.',
}

export const BAND_ERRORS: Record<string, string> = {
  count: 'Between 1 and 12 bands.',
  name: 'Each band needs a name (up to 40 characters).',
  start: 'The first band starts at level 1.',
  'gap-or-overlap': 'Bands cannot overlap or leave gaps.',
  range: 'The maximum level cannot be below the minimum.',
  'last-open': 'The last band has no maximum («and up»).',
  'only-last-open': 'Only the last band can have no maximum.',
}

export const errorText = (code: string) => ERRORS[code] ?? (code.startsWith('config-') ? BAND_ERRORS[code.slice(7)] : undefined) ?? code


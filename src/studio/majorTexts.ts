/** Spanish messages for the Majors tab (Trail Studio's language). */
export const ERRORS: Record<string, string> = {
  'not-signed-in': 'Tu sesión caducó: vuelve a entrar.',
  'not-admin': 'Tu cuenta no es administradora de los Majors.',
  'not-draft': 'Solo se puede cambiar un borrador.',
  'too-soon': 'Sale demasiado pronto para publicarlo (antes de que abra el READY).',
  final: 'Ese Major ya está terminado o cancelado.',
  'not-found': 'Ese Major ya no existe.',
  'event-name': 'El nombre debe tener entre 1 y 80 caracteres.',
  'event-description': 'La descripción admite hasta 500 caracteres.',
  'event-race': 'Elige una carrera del catálogo.',
  'event-start': 'La fecha de salida no es válida.',
  'event-past': 'La salida debe ser en el futuro.',
  'cancel-reason': 'Escribe el motivo de la cancelación.',
  'media-closed': 'El banner y los vídeos ya no se pueden cambiar: la carrera está en curso o terminada.',
  'media-segment': 'Ese tramo no existe en la carrera.',
  'media-path': 'Ese archivo no es de este Major.',
  'config-start-time': 'Hora de salida no válida.',
  'config-registration-days': 'Los días de inscripción van de 1 a 13.',
  'config-ready-minutes': 'Los minutos de READY van de 5 a 180.',
  'config-window': 'La ventana de decisión va de 30 a 600 s.',
  'config-running': 'La fase corriendo va de 30 a 900 s.',
  'config-limit': 'Los participantes van de 2 a 50.',
  network: 'No pude conectar con el servidor.',
  'bad-request': 'El servidor no entendió la petición.',
}

export const BAND_ERRORS: Record<string, string> = {
  count: 'Entre 1 y 12 bandas.',
  name: 'Cada banda necesita un nombre (hasta 40 caracteres).',
  start: 'La primera banda empieza en el nivel 1.',
  'gap-or-overlap': 'Las bandas no pueden solaparse ni dejar huecos.',
  range: 'El nivel máximo no puede ser menor que el mínimo.',
  'last-open': 'La última banda no tiene máximo («y más»).',
  'only-last-open': 'Solo la última banda puede no tener máximo.',
}

export const errorText = (code: string) => ERRORS[code] ?? (code.startsWith('config-') ? BAND_ERRORS[code.slice(7)] : undefined) ?? code


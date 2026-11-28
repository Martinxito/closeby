type Meeting = {
  startsAt: Date;
  location: string;
  title: string;
};

function formatDateTime(date: Date): string {
  const year = date.getUTCFullYear();
  if (!(year >= 1 && year <= 9999)) {
    throw new RangeError('Expected a valid calendar date with a four-digit year');
  }
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let folded = '';
  let lineBytes = 0;

  // Count UTF-8 bytes and fold between code points, including the continuation space.
  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (lineBytes + characterBytes > 75) {
      folded += '\r\n ';
      lineBytes = 1;
    }
    folded += character;
    lineBytes += characterBytes;
  }

  return folded;
}

/** Returns the UTF-8 text of a standalone .ics file for one meeting. */
export function createMeetingIcs({ startsAt, location, title }: Meeting): string {
  const start = formatDateTime(startsAt);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Closeby//Meeting Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`,
    `DTSTAMP:${formatDateTime(new Date())}`,
    `DTSTART:${start}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].map(foldLine).join('\r\n');
}

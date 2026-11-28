import { describe, expect, it } from 'vitest';
import { createMeetingIcs } from './calendar';

const meeting = {
  startsAt: new Date('2026-11-28T16:30:05-03:00'),
  location: 'Metro Los Leones',
  title: 'Entrega de cámara',
};

describe('createMeetingIcs', () => {
  it('creates a calendar with one event and writes the start in UTC', () => {
    expect(createMeetingIcs(meeting).split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Closeby//Meeting Calendar//EN',
      'BEGIN:VEVENT',
      expect.stringMatching(/^UID:[0-9a-f-]{36}$/),
      expect.stringMatching(/^DTSTAMP:\d{8}T\d{6}Z$/),
      'DTSTART:20261128T193005Z',
      'SUMMARY:Entrega de cámara',
      'LOCATION:Metro Los Leones',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ]);
  });

  it('escapes punctuation, backslashes and line breaks in event text', () => {
    const lines = createMeetingIcs({
      ...meeting,
      title: 'Entrega; cámara, lente\\bolso\r\nSegunda línea',
      location: 'Av. Providencia, 123\rEntrada B\nPiso 2',
    }).split('\r\n');

    expect(lines).toContain('SUMMARY:Entrega\\; cámara\\, lente\\\\bolso\\nSegunda línea');
    expect(lines).toContain('LOCATION:Av. Providencia\\, 123\\nEntrada B\\nPiso 2');
  });

  it('folds long lines within 75 UTF-8 bytes and preserves accents and emoji', () => {
    const title = `${'é'.repeat(33)}${'📍'.repeat(25)}`;
    const calendar = createMeetingIcs({ ...meeting, title });
    const encoder = new TextEncoder();

    expect(calendar.split('\r\n')).toContain(`SUMMARY:${'é'.repeat(33)}`);
    for (const line of calendar.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(calendar.replace(/\r\n /g, '').split('\r\n')).toContain(`SUMMARY:${title}`);
  });

  it.each([new Date(NaN), new Date('+010000-01-01T00:00:00Z')])(
    'rejects a start that iCalendar cannot represent (%s)',
    (startsAt) => {
      expect(() => createMeetingIcs({ ...meeting, startsAt })).toThrow(RangeError);
    },
  );
});
